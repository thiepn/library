import { inspectPublication } from '../publication-compatibility';
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
 * accessibility -> publisher compatibility. RR3 adds bounded package inspection before any
 * browser-local EPUB reaches EPUB.js.
 */
export async function mountCanonicalEpubReader(
  root: HTMLElement,
  candidate: ReaderCanonicalEpubCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderCompatibilityHarnessHandle> {
  if (candidate.source instanceof ArrayBuffer) {
    const compatibility = await inspectPublication(candidate.source, 'epub');
    root.dataset.epubCompatibility = compatibility.disposition;
    root.dataset.epubProfile = compatibility.profile;
    root.dataset.epubFeatures = compatibility.features.join(' ');
    root.dataset.epubScriptedContent = compatibility.capabilities.scriptedContent;
    if (compatibility.warnings.length) root.dataset.epubCompatibilityWarnings = String(compatibility.warnings.length);
    else delete root.dataset.epubCompatibilityWarnings;
  }

  return mountReaderShellWithCompatibilityHarness(
    root,
    candidate.source,
    candidate.identity,
    options,
    target,
    desktopOptions,
  );
}
