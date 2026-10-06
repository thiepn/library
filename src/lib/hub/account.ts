import { parseLibraryBackupJson, type LibraryBackupV1 } from '../client/library-portability';
import { getThiepnAccountClient, getVerifiedLibraryAccountUser } from '../account/supabase';
import { isLibrarySyncEnabledForUser } from '../account/sync';

export type HubAccountReadStatus =
  | 'off'
  | 'hub-signed-out'
  | 'library-signed-out'
  | 'account-mismatch'
  | 'sync-disabled'
  | 'empty'
  | 'available'
  | 'unavailable';

export interface HubAccountReadResult {
  status: HubAccountReadStatus;
  snapshot?: LibraryBackupV1;
}

/**
 * Read Library's native Account snapshot without mutating local or cloud state.
 * Hub never receives a Supabase token, the raw snapshot, annotations, anchors or files.
 */
export async function readLibraryHubAccountSnapshot(
  includeAccount: boolean,
  hubAccountId: string | null,
): Promise<HubAccountReadResult> {
  if (!includeAccount) return { status: 'off' };
  if (!hubAccountId) return { status: 'hub-signed-out' };

  try {
    const user = await getVerifiedLibraryAccountUser();
    if (!user) return { status: 'library-signed-out' };
    if (user.id.toLowerCase() !== hubAccountId.toLowerCase()) return { status: 'account-mismatch' };
    if (!isLibrarySyncEnabledForUser(user.id)) return { status: 'sync-disabled' };

    const { data, error } = await getThiepnAccountClient()
      .from('library_sync_state')
      .select('state')
      .maybeSingle();
    if (error) throw error;
    if (!data?.state) return { status: 'empty' };

    const snapshot = parseLibraryBackupJson(JSON.stringify(data.state));
    return { status: 'available', snapshot };
  } catch {
    return { status: 'unavailable' };
  }
}
