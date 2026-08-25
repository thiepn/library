import type { ResolvedWork } from '../content/repository';
import type { ReleaseArtifact } from '../content/releases';

export interface ReaderPublicationArtifact extends ReleaseArtifact {}

export interface ReaderPublicationCandidate {
  workId: string;
  slug: string;
  title: string;
  subtitle?: string;
  language: string;
  edition: number;
  version: string;
  epub: ReaderPublicationArtifact;
  pdf?: ReaderPublicationArtifact;
}

export function resolveReaderPublicationCandidate(work: ResolvedWork): ReaderPublicationCandidate | undefined {
  const release = work.release;
  const epub = release?.artifacts.epub;
  if (!release || !epub) return undefined;

  const pdf = release.artifacts.pdf;
  return {
    workId: work.id,
    slug: work.slug,
    title: work.title,
    ...(work.subtitle ? { subtitle: work.subtitle } : {}),
    language: work.language,
    edition: release.edition,
    version: release.version,
    epub,
    ...(pdf ? { pdf } : {}),
  };
}
