export type LibraryChoiceResult = 'pushed' | 'pulled' | 'synced' | 'conflict' | 'error' | 'offline' | 'disabled';
export function assessLibraryPostChoice(input: {
  originalResult: LibraryChoiceResult;
  expectedRevision: number | null;
  observedRevision: number | null;
  observedKind: 'matched' | 'baseline-missing' | 'both-changed' | 'cloud-only' | 'device-only' | 'cloud-missing';
  nativeAuthorityStillValid: boolean;
}): {
  status: 'observed-match' | 'retain-conflict' | 'unconfirmed';
  instruction: string;
  externalCustody: 'NOT_TESTED';
} {
  const remoteMatches = input.expectedRevision !== null &&
    input.observedRevision === input.expectedRevision;
  if (input.nativeAuthorityStillValid && remoteMatches &&
    input.observedKind === 'matched' &&
    ['pushed', 'pulled', 'synced'].includes(input.originalResult))
    return {
      status: 'observed-match',
      instruction: 'Both original Library heads matched at the post-choice read. This is not an atomic cross-device lock or evidence a backup was retained.',
      externalCustody: 'NOT_TESTED',
    };
  const unresolved = input.originalResult === 'conflict' ||
    !input.nativeAuthorityStillValid ||
    input.observedKind === 'both-changed' ||
    input.observedKind === 'cloud-only' ||
    input.observedKind === 'device-only' ||
    input.observedKind === 'cloud-missing' ||
    (input.expectedRevision !== null && !remoteMatches);
  return unresolved
    ? { status: 'retain-conflict',
      instruction: 'Original Library state or Account authority differs after the choice. Keep both safety copies, recompare heads and prepare again before resolving. No second write or automatic rollback was attempted.',
      externalCustody: 'NOT_TESTED' }
    : { status: 'unconfirmed',
      instruction: 'The original operation did not produce matching, independently re-observed heads. Keep the native backup and check Account status before another choice.',
      externalCustody: 'NOT_TESTED' };
}
