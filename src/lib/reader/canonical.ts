import {
  mountReaderShellWithCompatibilityHarness,
  type ReaderCompatibilityHarnessHandle,
} from './compatibility-harness';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderCanonicalEpubCandidate } from './source';
import type { ReaderOpenOptions } from './types';

export { readerCanonicalCandidateFromPublication } from './source';
export type { ReaderCanonicalEpubCandidate } from './source';

/**
 * ER3 canonical EPUB mount. Every public EPUB source enters the complete reader stack here:
 * progress/settings -> TOC -> search -> bookmarks -> annotations -> mobile -> desktop ->
 * accessibility -> publisher compatibility.
 */
export function mountCanonicalEpubReader(
  root: HTMLElement,
  candidate: ReaderCanonicalEpubCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderCompatibilityHarnessHandle> {
  return mountReaderShellWithCompatibilityHarness(
    root,
    candidate.source,
    candidate.identity,
    options,
    target,
    desktopOptions,
  );
}
