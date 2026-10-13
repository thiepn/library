export type NativeReconciliationOutcome =
  | 'confirmed-native-only' | 'owner-or-device-changed'
  | 'local-changed' | 'cloud-changed' | 'missing-cloud';
export function assessNativeReconciliation(input: {
  ownerId: string;
  deviceId: string;
  authenticatedOwnerId: string | null;
  activeOwnerId: string | null;
  activeDeviceId: string | null;
  enabled: boolean;
  expectedRevision: number;
  expectedHash: string;
  observedRevision: number | null;
  observedCloudHash: string | null;
  observedLocalHash: string;
}): NativeReconciliationOutcome {
  if (!input.ownerId || !input.deviceId || !input.enabled ||
    input.authenticatedOwnerId !== input.ownerId ||
    input.activeOwnerId !== input.ownerId ||
    input.activeDeviceId !== input.deviceId)
    return 'owner-or-device-changed';
  if (input.observedRevision === null || input.observedCloudHash === null)
    return 'missing-cloud';
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 ||
    !/^[a-f0-9]{64}$/.test(input.expectedHash))
    return 'cloud-changed';
  if (input.observedLocalHash !== input.expectedHash) return 'local-changed';
  if (input.observedRevision !== input.expectedRevision ||
    input.observedCloudHash !== input.expectedHash)
    return 'cloud-changed';
  return 'confirmed-native-only';
}
