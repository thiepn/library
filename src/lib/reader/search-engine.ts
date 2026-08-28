import ePub, { type Book, type NavItem } from 'epubjs';
import type { ReaderAnnotationIdentity } from './annotation-store';
import {
  getReaderSearchCache,
  putReaderSearchCache,
  type ReaderSearchCacheSection,
} from './search-cache';

export interface ReaderSearchResult {
  id: string;
  cfi: string;
  href: string;
  sectionIndex: number;
  sectionLabel: string;
  excerpt: string;
  matchStart: number;
  matchEnd: number;
}

export interface ReaderSearchProgress {
  completed: number;
  total: number;
  matches: number;
  fromCache: boolean;
}

export interface ReaderSearchResponse {
  query: string;
  results: ReaderSearchResult[];
  fromCache: boolean;
  partial: boolean;
  searchedSections: number;
  totalSections: number;
}

export interface ReaderSearchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: ReaderSearchProgress) => void;
}

interface EpubSearchSection {
  href: string;
  index: number;
  document?: Document;
  load(): Promise<unknown>;
  unload(): void;
  cfiFromRange(range: Range): string;
}

interface ReaderSearchSectionMatch {
  cfi: string;
  excerpt: string;
}

interface TextSegment {
  segment: string;
  index: number;
}

interface TextSegmenter {
  segment(input: string): Iterable<TextSegment>;
}

type TextSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: 'grapheme' },
) => TextSegmenter;

const MAX_RESULTS = 200;
const YIELD_EVERY_SECTIONS = 4;
const PROGRESS_EVERY_SECTIONS = 4;
const TEXT_NODE = 3;
const SHOW_TEXT = 4;
const EXCLUDED_TEXT_ANCESTORS = 'script, style, noscript, template';

function abortError(): DOMException {
  return new DOMException('Search cancelled.', 'AbortError');
}

function ensureActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export function normalizeReaderSearchQuery(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
}

function normalizedTextMap(value: string): { text: string; starts: number[]; ends: number[] } {
  const Segmenter = (Intl as unknown as { Segmenter?: TextSegmenterConstructor }).Segmenter;
  const segments: TextSegment[] = [];

  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: 'grapheme' });
    segments.push(...segmenter.segment(value));
  } else {
    let index = 0;
    for (const segment of value) {
      segments.push({ segment, index });
      index += segment.length;
    }
  }

  const parts: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of segments) {
    const normalized = segment.normalize('NFKC').toLocaleLowerCase();
    parts.push(normalized);
    for (let offset = 0; offset < normalized.length; offset += 1) {
      starts.push(index);
      ends.push(index + segment.length);
    }
  }
  return { text: parts.join(''), starts, ends };
}

function excerptForText(value: string, start: number, end: number): string {
  const context = 75;
  const from = Math.max(0, start - context);
  const to = Math.min(value.length, end + context);
  return `${from > 0 ? '…' : ''}${value.slice(from, to)}${to < value.length ? '…' : ''}`;
}

function isSearchableTextNode(node: Node): node is Text {
  if (node.nodeType !== TEXT_NODE || !(node.nodeValue ?? '').trim()) return false;
  const parent = node.parentElement;
  return !parent?.closest(EXCLUDED_TEXT_ANCESTORS);
}

/**
 * Search the exact loaded EPUB section document rather than EPUB.js Section.find().
 * EPUB.js 0.3.93 creates its TreeWalker from the host-page global document, which can
 * silently miss text in an XML document loaded from an archived personal EPUB.
 */
export function searchLoadedEpubSection(
  section: EpubSearchSection,
  rawQuery: string,
  maximumResults = MAX_RESULTS,
): ReaderSearchSectionMatch[] {
  const query = normalizeReaderSearchQuery(rawQuery);
  const doc = section.document;
  if (!query || !doc) return [];

  const results: ReaderSearchSectionMatch[] = [];
  const walker = doc.createTreeWalker(doc, SHOW_TEXT);
  let node: Node | null;
  while (results.length < maximumResults && (node = walker.nextNode())) {
    if (!isSearchableTextNode(node)) continue;
    const value = node.nodeValue ?? '';
    const mapped = normalizedTextMap(value);
    let cursor = 0;

    while (results.length < maximumResults) {
      const match = mapped.text.indexOf(query, cursor);
      if (match < 0) break;
      const matchEnd = match + query.length;
      const start = mapped.starts[match];
      const end = mapped.ends[matchEnd - 1];
      cursor = match + Math.max(1, query.length);
      if (start === undefined || end === undefined || end <= start) continue;

      try {
        const range = doc.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        results.push({
          cfi: section.cfiFromRange(range),
          excerpt: excerptForText(value, start, end),
        });
      } catch {
        // One malformed publisher text node must not abort searching the remaining section.
      }
    }
  }
  return results;
}

function flattenNavigation(items: NavItem[], labels = new Map<string, string>()): Map<string, string> {
  for (const item of items) {
    const href = item.href.split('#')[0] ?? item.href;
    if (href && !labels.has(href)) labels.set(href, item.label.trim());
    if (item.subitems?.length) flattenNavigation(item.subitems, labels);
  }
  return labels;
}

function labelForHref(href: string, labels: Map<string, string>, index: number): string {
  const normalized = href.split('#')[0] ?? href;
  if (labels.has(normalized)) return labels.get(normalized)!;
  for (const [candidate, label] of labels) {
    if (normalized.endsWith(candidate) || candidate.endsWith(normalized)) return label;
  }
  return `Section ${index + 1}`;
}

function toSearchSections(book: Book): EpubSearchSection[] {
  return (book.spine.spineItems as unknown as EpubSearchSection[])
    .filter((section) => Boolean(section?.href));
}

function snippetMatch(excerpt: string, normalizedQuery: string): { start: number; end: number } {
  const normalizedExcerpt = excerpt.normalize('NFKC').toLocaleLowerCase();
  const start = normalizedExcerpt.indexOf(normalizedQuery);
  return start >= 0 ? { start, end: start + normalizedQuery.length } : { start: 0, end: 0 };
}

function resultId(sectionIndex: number, matchIndex: number, cfi: string): string {
  return `${sectionIndex}:${matchIndex}:${cfi}`;
}

export class ReaderSearchEngine {
  private readonly source: string | ArrayBuffer;
  private readonly identity: ReaderAnnotationIdentity;
  private searchBook?: Book;
  private destroyed = false;

  constructor(source: string | ArrayBuffer, identity: ReaderAnnotationIdentity) {
    this.source = source;
    this.identity = identity;
  }

  async search(rawQuery: string, options: ReaderSearchOptions = {}): Promise<ReaderSearchResponse> {
    this.assertUsable();
    const query = normalizeReaderSearchQuery(rawQuery);
    if (!query) return { query, results: [], fromCache: false, partial: false, searchedSections: 0, totalSections: 0 };
    ensureActive(options.signal);

    const book = this.getBook();
    await book.ready;
    ensureActive(options.signal);

    const sections = toSearchSections(book);
    const totalSections = sections.length;
    const navigation = flattenNavigation((await book.loaded.navigation).toc);
    const cached = await getReaderSearchCache(this.identity, query);
    const cachedSections = new Map(cached?.sections.map((section) => [section.href, section]) ?? []);
    const outputSections: ReaderSearchCacheSection[] = [];
    const results: ReaderSearchResult[] = [];
    let searchedSections = 0;
    let partial = false;
    let usedCache = 0;

    for (let index = 0; index < sections.length && results.length < MAX_RESULTS; index += 1) {
      ensureActive(options.signal);
      const section = sections[index]!;
      const sectionLabel = labelForHref(section.href, navigation, index);
      const cachedSection = cachedSections.get(section.href);
      let sectionMatches: ReaderSearchSectionMatch[] = [];

      if (cachedSection) {
        sectionMatches = cachedSection.matches.map((match) => ({ cfi: match.cfi, excerpt: match.excerpt }));
        usedCache += 1;
      } else {
        try {
          await section.load();
          ensureActive(options.signal);
          if (!section.document) throw new Error(`EPUB section ${section.href} did not expose its loaded document.`);
          sectionMatches = searchLoadedEpubSection(section, query, MAX_RESULTS - results.length);
        } catch (error) {
          if (options.signal?.aborted) throw abortError();
          partial = true;
          sectionMatches = [];
        } finally {
          section.unload();
        }
      }

      const cacheSection: ReaderSearchCacheSection = {
        href: section.href,
        sectionIndex: section.index ?? index,
        sectionLabel,
        matches: sectionMatches.map((match) => ({ cfi: match.cfi, excerpt: match.excerpt })),
      };
      outputSections.push(cacheSection);

      for (let matchIndex = 0; matchIndex < sectionMatches.length && results.length < MAX_RESULTS; matchIndex += 1) {
        const match = sectionMatches[matchIndex]!;
        const bounds = snippetMatch(match.excerpt, query);
        results.push({
          id: resultId(section.index ?? index, matchIndex, match.cfi),
          cfi: match.cfi,
          href: section.href,
          sectionIndex: section.index ?? index,
          sectionLabel,
          excerpt: match.excerpt,
          matchStart: bounds.start,
          matchEnd: bounds.end,
        });
      }

      searchedSections = index + 1;
      if (searchedSections % PROGRESS_EVERY_SECTIONS === 0 || searchedSections === totalSections) {
        options.onProgress?.({
          completed: searchedSections,
          total: totalSections,
          matches: results.length,
          fromCache: usedCache === searchedSections,
        });
      }
      if (searchedSections % YIELD_EVERY_SECTIONS === 0) {
        await nextTask();
        ensureActive(options.signal);
      }
    }

    ensureActive(options.signal);
    if (!partial && searchedSections === totalSections && usedCache !== totalSections) {
      await putReaderSearchCache(this.identity, query, outputSections);
    }

    return {
      query,
      results,
      fromCache: totalSections > 0 && usedCache === totalSections,
      partial,
      searchedSections,
      totalSections,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.searchBook?.destroy();
    this.searchBook = undefined;
  }

  private getBook(): Book {
    if (!this.searchBook) {
      this.searchBook = ePub(typeof this.source === 'string' ? this.source : this.source.slice(0));
    }
    return this.searchBook;
  }

  private assertUsable(): void {
    if (this.destroyed) throw new Error('Reader search engine has been destroyed.');
  }
}
