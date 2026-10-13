/** A readback witness over ORIGINAL Library storage, never a custody receipt. */
export interface LibraryRestoreReadback {
  ownerId: string;
  deviceId: string;
  revision: number;
  expectedHash: string;
  observedHash: string;
  authenticatedOwnerId: string | null;
  activeDevice: boolean;
}
export function assessLibraryRestoreReadback(value: LibraryRestoreReadback) {
  if (!value.ownerId || !value.deviceId ||
    value.authenticatedOwnerId !== value.ownerId || !value.activeDevice)
    return { status: 'authority-changed' as const, next: 'Preserve the original backup and reconnect the correct THIEPN Account before trying again.' };
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !/^[a-f0-9]{64}$/.test(value.expectedHash) ||
    !/^[a-f0-9]{64}$/.test(value.observedHash))
    return { status: 'invalid-head' as const, next: 'The original Library cloud checkpoint could not be verified.' };
  if (value.expectedHash !== value.observedHash)
    return { status: 'readback-diverged' as const, next: 'Local state did not match the native cloud snapshot after import. Do not treat this revision as synced; inspect or restore your original portable backup.' };
  return { status: 'native-readback-only' as const, next: 'Original Library local readback matches the chosen cloud snapshot. This does not certify independent offsite durability.' };
}
