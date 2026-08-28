import type { ReaderAnnotationIdentity } from './annotation-store';
import {
  mountReaderShellWithCompatibilityHarness,
  type ReaderCompatibilityHarnessHandle,
} from './compatibility-harness';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderCanonicalEpubCandidate {
  source: string | ArrayBuffer;
  identity: ReaderAnnotationIdentity;
}

/**
 * Converts a hosted immutable publication into the same canonical source contract used by
 * browser-local EPUBs. Source transport may differ; reader behavior and release identity do not.
 */
export function readerCanonicalCandidateFromPublication(
  publication: ReaderPublicationCandidate,
): ReaderCanonicalEpubCandidate {
  return {
    source: publication.epub.url,
    identity: {
      workId: publication.workId,
      edition: publication.edition,
      releaseVersion: publication.version,
    },
  };
}

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
