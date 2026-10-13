export interface NativeCloudRestorePreview {
  ownerId: string;
  deviceId: string;
  localHash: string;
  cloudHash: string;
  cloudRevision: number;
  expiresAt: number;
}
export interface NativeCloudRestoreHead {
  ownerId: string;
  deviceId: string;
  localHash: string;
  cloudHash: string;
  cloudRevision: number;
  now: number;
  nativeEnabled: boolean;
}

/** Pure fail-closed check used by the ORIGINAL Library cloud restore writer. */
export function validateNativeCloudRestore(
  preview: NativeCloudRestorePreview | null,
  current: NativeCloudRestoreHead,
): 'ready' | 'not-prepared' | 'expired' | 'owner-changed' |
  'local-changed' | 'cloud-changed' {
  if (!preview) return 'not-prepared';
  if (!current.nativeEnabled || preview.ownerId !== current.ownerId ||
    preview.deviceId !== current.deviceId) return 'owner-changed';
  if (!Number.isSafeInteger(current.now) || current.now >= preview.expiresAt ||
    preview.expiresAt - current.now > 120_000) return 'expired';
  if (preview.localHash !== current.localHash) return 'local-changed';
  if (preview.cloudHash !== current.cloudHash ||
    preview.cloudRevision !== current.cloudRevision) return 'cloud-changed';
  return 'ready';
}
