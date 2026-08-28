import type { ReaderAnnotationIdentity } from './annotation-store';
import type { ReaderPublicationCandidate } from './publication';

export interface ReaderCanonicalEpubCandidate {
  source: string | ArrayBuffer;
  identity: ReaderAnnotationIdentity;
}

/**
 * Pure transport-to-reader adapter. It deliberately has no DOM, EPUB engine, stylesheet,
 * persistence, or lifecycle dependency so exact source/release identity can be verified in
 * isolation from the browser reader runtime.
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
