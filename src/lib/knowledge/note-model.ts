/** Authored notebook documents, independent of reader highlights and bookmarks. */
export const BOOK_NOTE_MAX_BODY = 250_000;
export const BOOK_NOTE_MAX_TITLE = 200;
export type BookNoteScope = 'book-overview' | 'chapter-summary' | 'reading-note';
export type SourceAnchorV1 =
  | { format: 'epub'; edition: number; releaseVersion: string; chapterHref: string; chapterLabel?: string; cfi?: string }
  | { format: 'pdf'; edition: number; releaseVersion: string; page: number }
  | { format: 'web'; chapterId: string };

export interface BookNoteDocumentV1 {
  schemaVersion: 1;
  id: string;
  workId: string;
  scope: BookNoteScope;
  title: string;
  bodyMarkdown: string;
  chapterKey?: string;
  scopeKey?: string;
  anchor?: SourceAnchorV1;
  sourceAnnotations: Array<{ format: 'epub' | 'pdf' | 'web'; id: string }>;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const validEdition = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export function isSourceAnchorV1(value: unknown): value is SourceAnchorV1 {
  if (!isObject(value)) return false;
  if (value.format === 'epub') {
    return validEdition(value.edition)
      && typeof value.releaseVersion === 'string' && value.releaseVersion.length > 0
      && typeof value.chapterHref === 'string' && value.chapterHref.length > 0
      && (value.cfi === undefined || (typeof value.cfi === 'string' && value.cfi.startsWith('epubcfi(')))
      && (value.chapterLabel === undefined || typeof value.chapterLabel === 'string');
  }
  if (value.format === 'pdf') {
    return validEdition(value.edition)
      && typeof value.releaseVersion === 'string' && value.releaseVersion.length > 0
      && Number.isSafeInteger(value.page) && (value.page as number) >= 1;
  }
  return value.format === 'web' && typeof value.chapterId === 'string' && value.chapterId.length > 0;
}

export function normalizedChapterKey(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ').slice(0, 240);
}

export function isBookNoteDocumentV1(value: unknown): value is BookNoteDocumentV1 {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== 1 || typeof value.id !== 'string' || !value.id || value.id.length > 180) return false;
  if (typeof value.workId !== 'string' || !value.workId || value.workId.length > 250) return false;
  if (value.scope !== 'book-overview' && value.scope !== 'chapter-summary' && value.scope !== 'reading-note') return false;
  if (typeof value.title !== 'string' || value.title.length > BOOK_NOTE_MAX_TITLE) return false;
  if (typeof value.bodyMarkdown !== 'string' || value.bodyMarkdown.length > BOOK_NOTE_MAX_BODY) return false;
  if (value.chapterKey !== undefined && (typeof value.chapterKey !== 'string' || value.chapterKey.length > 240)) return false;
  if (value.scopeKey !== undefined && (typeof value.scopeKey !== 'string' || value.scopeKey.length > 260)) return false;
  if (value.scope === 'book-overview' && value.scopeKey !== 'overview') return false;
  if (value.scope === 'chapter-summary' && (!value.chapterKey || value.scopeKey !== 'chapter:' + value.chapterKey)) return false;
  if (value.scope === 'reading-note' && value.scopeKey !== undefined) return false;
  if (value.anchor !== undefined && !isSourceAnchorV1(value.anchor)) return false;
  if (!Array.isArray(value.sourceAnnotations) || value.sourceAnnotations.length > 1000 ||
    !value.sourceAnnotations.every((item) => isObject(item)
      && (item.format === 'epub' || item.format === 'pdf' || item.format === 'web')
      && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200)) return false;
  return validDate(value.createdAt) && validDate(value.updatedAt)
    && Number.isSafeInteger(value.revision) && (value.revision as number) >= 1;
}

export function notebookTitle(doc: Pick<BookNoteDocumentV1, 'scope' | 'title'>): string {
  return doc.title.trim() || (doc.scope === 'book-overview' ? 'Book overview' :
    doc.scope === 'chapter-summary' ? 'Chapter summary' : 'Reading note');
}

export function bookNoteToMarkdown(doc: BookNoteDocumentV1): string {
  const title = notebookTitle(doc).replace(/[\r\n]+/g, ' ');
  return '# ' + title + '\n\n' + doc.bodyMarkdown.trim() + '\n';
}
