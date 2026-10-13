import type { NativeCloudRestorePreview } from './recovery-guard';

export type LibrarySafetyDirection = 'use-device' | 'use-cloud';

/** Pure owner-scoped comparison. Never holds backup bytes or keys. */
export function assessSavedLibrarySafetyCopy(input: {
  direction: LibrarySafetyDirection;
  preview: NativeCloudRestorePreview | null;
  ownerId: string;
  deviceId: string;
  selectedHash: string;
  now: number;
}): 'ready' | 'not-prepared' | 'owner-changed' | 'expired' | 'wrong-copy' {
  const { preview, ownerId, deviceId, direction, selectedHash, now } = input;
  if (!preview) return 'not-prepared';
  if (preview.ownerId !== ownerId || preview.deviceId !== deviceId)
    return 'owner-changed';
  if (!Number.isSafeInteger(now) || now >= preview.expiresAt ||
      preview.expiresAt - now > 120_000) return 'expired';
  const expected = direction === 'use-device' ? preview.cloudHash : preview.localHash;
  return /^[a-f0-9]{64}$/.test(selectedHash) && selectedHash === expected
    ? 'ready' : 'wrong-copy';
}

/** Grounded guidance for the original Library conflict chooser. */
export function explainNativeLibraryConflictIssue(code: string) {
  if (/WRONG_COPY|wrong-copy|FILE_TOO_LARGE/.test(code))
    return 'The selected file does not match the original prepared safety snapshot. Choose the matching downloaded JSON file; no copy was replaced.';
  if (/OWNER|PERMISSION|owner-changed/.test(code))
    return 'The original Account or device permission changed. Reconnect Library and prepare a new safety copy.';
  if (/HEAD_CHANGED|cloud-changed|local-changed|CLOUD_CHANGED/.test(code))
    return 'Local or cloud reading state changed since the safety download. Compare the latest revisions and download new copies before choosing.';
  if (/EXPIRED|PREPARATION_INTERRUPTED|expired/.test(code))
    return 'The two-minute recovery preparation expired or was interrupted. Prepare a new original-format backup.';
  if (/NOT_PREPARED|not-prepared|Verify the saved/.test(code))
    return 'First prepare and download the original safety snapshot; then select that saved JSON file to validate it before replacing anything.';
  return 'Library could not validate the saved safety copy. Nothing was replaced. Inspect the original backup and retry.';
}
