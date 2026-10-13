/** Owner-facing B20 preview of ORIGINAL Library CAS heads (no content). */
export type NativeLibraryHeadKind = 'baseline-missing' | 'both-changed' | 'cloud-only' | 'device-only' | 'matched' | 'cloud-missing';
export function describeNativeLibraryHeads(input: {
  baselineRevision: number | null;
  baselineHash: string | null;
  localHash: string;
  cloudRevision: number | null;
  cloudHash: string | null;
}): { kind: NativeLibraryHeadKind; guidance: string } {
  const good = (value: string | null) => Boolean(value && /^[a-f0-9]{64}$/.test(value));
  if (input.cloudRevision === null || input.cloudHash === null)
    return { kind: 'cloud-missing', guidance: 'The native Library cloud snapshot is absent. Preserve the device backup before considering an original CAS upload.' };
  if (!Number.isSafeInteger(input.baselineRevision) || input.baselineRevision! < 0 ||
    !good(input.baselineHash) || !good(input.cloudHash) || !good(input.localHash))
    return { kind: 'baseline-missing', guidance: 'No complete verified sync baseline is available. Preserve a native backup and compare both copies before selecting authority.' };
  const localChanged = input.localHash !== input.baselineHash;
  const cloudChanged = input.cloudRevision !== input.baselineRevision ||
    input.cloudHash !== input.baselineHash;
  if (localChanged && cloudChanged)
    return { kind: 'both-changed', guidance: 'Both native heads differ from this device’s last confirmed baseline. A manual choice and a saved original backup are required; no records were merged.' };
  if (localChanged) return { kind: 'device-only', guidance: 'Only this device differs from the last observed baseline. Recheck native sync before replacing a remote copy.' };
  if (cloudChanged) return { kind: 'cloud-only', guidance: 'Only the remote snapshot differs from the last observed baseline. Prepare the original Library local backup before pulling.' };
  return { kind: 'matched', guidance: 'Native Library heads match the last observed baseline at this inspection. Concurrent writes can still occur afterward.' };
}
