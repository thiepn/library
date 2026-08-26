import type { ResolvedWork } from '../content/repository';
import {
  resolveReaderPublicationCandidate,
  type ReaderPublicationArtifact,
  type ReaderPublicationCandidate,
} from './publication';

export type ReaderMigrationMode = 'native-epub' | 'legacy-web' | 'unavailable';
export type ReaderMigrationReason =
  | 'active-epub-release'
  | 'legacy-web-materialized'
  | 'no-readable-publication';

export interface ReaderMigrationDecision {
  mode: ReaderMigrationMode;
  reason: ReaderMigrationReason;
  publication?: ReaderPublicationCandidate;
}

const CANONICAL_MEDIA_ORIGIN = 'https://thiepn.dev/library/media/';

/**
 * Resolve the public reader for a work without any title-specific migration list.
 * A valid active EPUB release wins; verified legacy Markdown remains the fallback.
 */
export function resolveReaderMigration(work: ResolvedWork): ReaderMigrationDecision {
  const publication = resolveReaderPublicationCandidate(work);
  if (publication) {
    return {
      mode: 'native-epub',
      reason: 'active-epub-release',
      publication,
    };
  }

  if (work.webMaterialized) {
    return {
      mode: 'legacy-web',
      reason: 'legacy-web-materialized',
    };
  }

  return {
    mode: 'unavailable',
    reason: 'no-readable-publication',
  };
}

export function readerCanOpen(work: ResolvedWork): boolean {
  return resolveReaderMigration(work).mode !== 'unavailable';
}

/**
 * Convert a canonical production media URL to the current Library base. Noncanonical
 * URLs are preserved so the release registry remains authoritative for external media.
 */
export function localizeReaderArtifact(
  artifact: ReaderPublicationArtifact,
  base: string,
): ReaderPublicationArtifact {
  if (!artifact.url.startsWith(CANONICAL_MEDIA_ORIGIN)) return artifact;
  const normalizedBase = base.replace(/\/$/, '');
  const relative = artifact.url.slice(CANONICAL_MEDIA_ORIGIN.length);
  return {
    ...artifact,
    url: `${normalizedBase}/media/${relative}`,
  };
}

/**
 * Convert canonical production media URLs to the current Library base so the EPUB
 * remains same-origin when rendered by EPUB.js. Noncanonical URLs are preserved.
 */
export function localizeReaderPublication(
  publication: ReaderPublicationCandidate,
  base: string,
): ReaderPublicationCandidate {
  return {
    ...publication,
    epub: localizeReaderArtifact(publication.epub, base),
    ...(publication.pdf ? { pdf: localizeReaderArtifact(publication.pdf, base) } : {}),
  };
}
