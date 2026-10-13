import type { NativeLibraryHeadKind } from './conflict-preview';

/** Read-only confirmation after ORIGINAL Library CAS / portability writes. */
export function classifyPostChoiceRecovery(input: {
  initialResult: 'pushed' | 'pulled' | 'synced' | 'conflict' | 'error';
  heads: NativeLibraryHeadKind | null;
}) {
  if (input.initialResult === 'error' || input.initialResult === 'conflict')
    return {
      status: 'unresolved' as const,
      guidance: 'Native Library still reports a conflict or error. Preserve both backup files and inspect each head again.',
    };
  if (input.heads === 'matched')
    return {
      status: 'observed-matched' as const,
      guidance: 'This device and cloud matched the original native baseline at the follow-up read. Later changes are still possible.',
    };
  return {
    status: 'changed-after-choice' as const,
    guidance: 'The original cloud or local copy changed after the choice, or the Account could not verify it. The previous success must not clear the conflict hold. Reinspect and preserve both portable copies.',
  };
}
