import type { LibrarySyncResult } from './sync';
export interface LibraryRecoverySnapshot {
  ownerId: string | null;
  baselineOwner: string | null;
  nativeEnabled: boolean;
  coreAllowed: boolean;
  lastSyncedAt: string | null;
  latest: LibrarySyncResult['status'] | null;
  online: boolean;
}
export interface LibraryRecoveryFinding {
  status: 'sign-in' | 'local-only' | 'owner-mismatch' | 'offline' |
    'conflict' | 'error' | 'no-baseline' | 'ready';
  action: string;
  /** Local/native observation only; never a remotely attested recovery receipt. */
  isExternallyCertified: false;
}
export function inspectLibraryRecovery(input: LibraryRecoverySnapshot): LibraryRecoveryFinding {
  let status: LibraryRecoveryFinding['status'];
  let action: string;
  if (!input.ownerId) {
    status='sign-in';action='Sign in through the original Account page to inspect private Library cloud state.';
  } else if (!input.nativeEnabled) {
    status='local-only';action='Reading remains local. Export a manual Library backup or explicitly enable native Account sync.';
  } else if (input.baselineOwner && input.baselineOwner !== input.ownerId) {
    status='owner-mismatch';action='Stop. Native baseline belongs to another Account; verify identity before requesting sync.';
  } else if (!input.online) {
    status='offline';action='Stay offline and keep reading locally. Export a backup, then retry native sync when online.';
  } else if (input.latest==='conflict') {
    status='conflict';action='Do not overwrite either copy. Export a Library backup, then choose Device or Cloud in Library’s own conflict chooser.';
  } else if (input.latest==='error') {
    status='error';action='Native Library sync failed. Preserve local records, export a backup and retry from the Account page.';
  } else if (!input.lastSyncedAt) {
    status='no-baseline';action='No confirmed native cloud checkpoint on this device. Use Library Sync now; Core permission is separate.';
  } else {
    status='ready';action=input.coreAllowed
      ? 'A native sync checkpoint exists. Core requests require separate device consent and still use Library CAS.'
      : 'A native sync checkpoint exists. Core coordination is disabled on this device.';
  }
  return {status,action,isExternallyCertified:false};
}
