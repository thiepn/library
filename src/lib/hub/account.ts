import {
  getVerifiedLibraryAccountUser,
} from '../account/supabase';
import {
  isLibrarySyncEnabledForUser,
  reconcileLibraryAccountSync,
} from '../account/sync';

export type HubAccountReconcileStatus =
  | 'off'
  | 'hub-signed-out'
  | 'library-signed-out'
  | 'account-mismatch'
  | 'sync-disabled'
  | 'synced'
  | 'conflict'
  | 'offline'
  | 'unavailable';

export interface HubAccountReconcileResult {
  status: HubAccountReconcileStatus;
  accountSynced: boolean;
}

/**
 * Reconcile through Library's native Account contract before Hub reads metadata.
 * Hub never receives a Supabase token, raw cloud snapshot, annotation, anchor or file.
 */
export async function reconcileLibraryForHubAccount(
  includeAccount: boolean,
  hubAccountId: string | null,
): Promise<HubAccountReconcileResult> {
  if (!includeAccount) return { status: 'off', accountSynced: false };
  if (!hubAccountId) return { status: 'hub-signed-out', accountSynced: false };

  try {
    const user = await getVerifiedLibraryAccountUser();
    if (!user) return { status: 'library-signed-out', accountSynced: false };
    if (user.id.toLowerCase() !== hubAccountId.toLowerCase()) {
      return { status: 'account-mismatch', accountSynced: false };
    }
    if (!isLibrarySyncEnabledForUser(user.id)) {
      return { status: 'sync-disabled', accountSynced: false };
    }

    const result = await reconcileLibraryAccountSync(user);
    if (result.status === 'synced' || result.status === 'pushed' || result.status === 'pulled') {
      return { status: 'synced', accountSynced: true };
    }
    if (result.status === 'conflict') return { status: 'conflict', accountSynced: false };
    if (result.status === 'offline') return { status: 'offline', accountSynced: false };
    return { status: 'unavailable', accountSynced: false };
  } catch {
    return { status: 'unavailable', accountSynced: false };
  }
}
