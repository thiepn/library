import { parseLibraryBackupJson, type LibraryBackupV1 } from '../client/library-portability';
import {
  THIEPN_ACCOUNT_URL,
  getThiepnAccountPublishableKey,
  getThiepnAccountSession,
  getVerifiedLibraryAccountIdentity,
} from '../account/supabase';
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read Library's native Account snapshot without mutating local or cloud state.
 * RLS remains authoritative. Hub never receives the token, raw snapshot,
 * annotations, anchors or files.
 */
export async function readLibraryHubAccountSnapshot(
  includeAccount: boolean,
  hubAccountId: string | null,
): Promise<HubAccountReadResult> {
  if (!includeAccount) return { status: 'off' };
  if (!hubAccountId) return { status: 'hub-signed-out' };

  try {
    const user = await getVerifiedLibraryAccountIdentity();
    if (!user) return { status: 'library-signed-out' };
    if (user.id.toLowerCase() !== hubAccountId.toLowerCase()) return { status: 'account-mismatch' };
    if (!isLibrarySyncEnabledForUser(user.id)) return { status: 'sync-disabled' };

    const token = await getThiepnAccountSession().getAccessToken();
    if (!token) return { status: 'library-signed-out' };

    const url = new URL('/rest/v1/library_sync_state', THIEPN_ACCOUNT_URL);
    url.searchParams.set('select', 'state');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        apikey: getThiepnAccountPublishableKey(),
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: 'unavailable' };

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return { status: 'unavailable' };
    if (payload.length === 0) return { status: 'empty' };
    const row = payload[0];
    if (!isObject(row) || !('state' in row)) return { status: 'unavailable' };

    const snapshot = parseLibraryBackupJson(JSON.stringify(row.state));
    return { status: 'available', snapshot };
  } catch {
    return { status: 'unavailable' };
  }
}
