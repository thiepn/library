import ePub, { type Book } from 'epubjs';

export interface ReaderSearchMatch {
  cfi: string;
  href: string;
  sectionIndex: number;
  excerpt: string;
}

export interface ReaderSearchProgress {
  scannedSections: number;
  totalSections: number;
  resultCount: number;
}

export interface ReaderSearchResponse extends ReaderSearchProgress {
  results: ReaderSearchMatch[];
  failedSections: number;
  truncated: boolean;
}

export interface ReaderSearchOptions {
  maxResults?: number;
  maxSequentialElements?: number;
  yieldEverySections?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ReaderSearchProgress) => void;
}

interface RawSectionMatch {
  cfi?: unknown;
  excerpt?: unknown;
}

interface SearchableSection {
  href?: string;
  index?: number;
  load(request: Function): Promise<unknown> | unknown;
  search?: (query: string, maxSequentialElements?: number) => RawSectionMatch[];
  find?: (query: string) => RawSectionMatch[];
  unload(): void;
}

const DEFAULT_MAX_RESULTS = 200;
const DEFAULT_MAX_SEQUENTIAL_ELEMENTS = 5;
const DEFAULT_YIELD_EVERY_SECTIONS = 4;

export function normalizeReaderSearchQuery(value: string): string {
  return value.trim().normalize('NFC');
}

function searchVariants(query: string): string[] {
  return [...new Set([query.normalize('NFC'), query.normalize('NFD')])];
}

function abortError(): Error {
  const error = new Error('Book search was cancelled.');
  error.name = 'AbortError';
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function yieldToMainThread(signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assertNotAborted(signal);
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value!)));
}

function collectSections(book: Book): SearchableSection[] {
  const sections: SearchableSection[] = [];
  book.spine.each((section: SearchableSection) => {
    if (section) sections.push(section);
  });
  return sections;
}

function normalizeMatch(raw: RawSectionMatch, section: SearchableSection, fallbackIndex: number): ReaderSearchMatch | undefined {
  const cfi = typeof raw.cfi === 'string' ? raw.cfi : '';
  if (!cfi.startsWith('epubcfi(')) return undefined;
  return {
    cfi,
    href: typeof section.href === 'string' ? section.href : '',
    sectionIndex: typeof section.index === 'number' && Number.isFinite(section.index) ? section.index : fallbackIndex,
    excerpt: typeof raw.excerpt === 'string' ? raw.excerpt.trim() : '',
  };
}

/**
 * Search-only EPUB adapter. It never renders a second visible rendition and never executes EPUB scripts.
 * Sections are loaded one at a time, searched for CFI-bearing matches, and unloaded immediately.
 */
export class EpubSearchEngine {
  private readonly source: string | ArrayBuffer;
  private book: Book | undefined;
  private opening: Promise<Book> | undefined;

  constructor(source: string | ArrayBuffer) {
    this.source = source instanceof ArrayBuffer ? source.slice(0) : source;
  }

  async search(rawQuery: string, options: ReaderSearchOptions = {}): Promise<ReaderSearchResponse> {
    const query = normalizeReaderSearchQuery(rawQuery);
    if (!query) return { results: [], scannedSections: 0, totalSections: 0, resultCount: 0, failedSections: 0, truncated: false };

    const signal = options.signal;
    assertNotAborted(signal);
    const book = await this.requireBook();
    assertNotAborted(signal);

    const sections = collectSections(book);
    const totalSections = sections.length;
    const maxResults = boundedInteger(options.maxResults, DEFAULT_MAX_RESULTS, 1, 500);
    const maxSequentialElements = boundedInteger(options.maxSequentialElements, DEFAULT_MAX_SEQUENTIAL_ELEMENTS, 1, 12);
    const yieldEverySections = boundedInteger(options.yieldEverySections, DEFAULT_YIELD_EVERY_SECTIONS, 1, 20);
    const variants = searchVariants(query);
    const deduped = new Map<string, ReaderSearchMatch>();
    let scannedSections = 0;
    let failedSections = 0;
    let truncated = false;

    for (let index = 0; index < sections.length; index += 1) {
      assertNotAborted(signal);
      const section = sections[index];
      try {
        await Promise.resolve(section.load(book.load.bind(book)));
        assertNotAborted(signal);
        for (const variant of variants) {
          const rawMatches = typeof section.search === 'function'
            ? section.search(variant, maxSequentialElements)
            : typeof section.find === 'function'
              ? section.find(variant)
              : [];
          for (const raw of rawMatches) {
            const match = normalizeMatch(raw, section, index);
            if (!match || deduped.has(match.cfi)) continue;
            deduped.set(match.cfi, match);
            if (deduped.size >= maxResults) {
              truncated = index < sections.length - 1 || rawMatches.length > 1;
              break;
            }
          }
          if (deduped.size >= maxResults) break;
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw abortError();
        failedSections += 1;
      } finally {
        try { section.unload(); } catch {}
      }

      scannedSections = index + 1;
      options.onProgress?.({ scannedSections, totalSections, resultCount: deduped.size });
      if (deduped.size >= maxResults) {
        truncated = truncated || scannedSections < totalSections;
        break;
      }
      if (scannedSections % yieldEverySections === 0) await yieldToMainThread(signal);
    }

    const results = [...deduped.values()];
    return {
      results,
      scannedSections,
      totalSections,
      resultCount: results.length,
      failedSections,
      truncated,
    };
  }

  destroy(): void {
    this.opening = undefined;
    this.book?.destroy();
    this.book = undefined;
  }

  private async requireBook(): Promise<Book> {
    if (this.book) return this.book;
    if (!this.opening) {
      this.opening = (async () => {
        const book = ePub(this.source);
        await book.ready;
        this.book = book;
        return book;
      })();
    }
    try {
      return await this.opening;
    } catch (error) {
      this.opening = undefined;
      throw error;
    }
  }
}
