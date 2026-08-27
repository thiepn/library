import { getLegacyProgress } from '../client/library-db';

export const LEGACY_READER_QUERY_PARAM = 'legacy';

export interface LegacyResumeRequest {
  base: string;
  workId: string;
  slug: string;
  chapterIds: readonly string[];
  firstChapter: string;
}

function normalizeBase(base: string): string {
  return base.replace(/\/$/, '');
}

export function isLegacyReaderRequested(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  const value = params.get(LEGACY_READER_QUERY_PARAM);
  return value === '1' || value === 'true';
}

export function buildLegacyReaderHref(base: string, slug: string): string {
  return `${normalizeBase(base)}/works/${encodeURIComponent(slug)}/read?${LEGACY_READER_QUERY_PARAM}=1`;
}

export function buildLegacyChapterHref(base: string, slug: string, chapterId: string): string {
  return `${normalizeBase(base)}/works/${encodeURIComponent(slug)}/read/${encodeURIComponent(chapterId)}`;
}

/**
 * Resolve only among verified legacy chapter IDs. P29 intentionally does not translate
 * Markdown percentages/chapter IDs into EPUB CFIs or percentages because releases may
 * have been rewritten and there is no trustworthy positional equivalence contract.
 */
export async function resolveLegacyResumeHref(request: LegacyResumeRequest): Promise<string> {
  const allowed = new Set(request.chapterIds);
  let chapterId = request.firstChapter;
  try {
    const progress = await getLegacyProgress(request.workId);
    if (progress?.chapterId && allowed.has(progress.chapterId)) chapterId = progress.chapterId;
  } catch {
    // Compatibility mode remains usable even if IndexedDB is unavailable.
  }
  return buildLegacyChapterHref(request.base, request.slug, chapterId);
}
