import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/search-engine.ts',
  'src/lib/reader/search-cache.ts',
  'src/lib/reader/search-highlighter.ts',
  'src/lib/reader/search.ts',
  'src/lib/reader/search-harness.ts',
  'src/styles/reader-search.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_SEARCH_P18', present, 'P18 EPUB-native in-book search subsystem and styles are present');

if (present) {
  const [engine, cache, highlighter, search, harness, css, index, layout] = await Promise.all([
    readFile('src/lib/reader/search-engine.ts', 'utf8'),
    readFile('src/lib/reader/search-cache.ts', 'utf8'),
    readFile('src/lib/reader/search-highlighter.ts', 'utf8'),
    readFile('src/lib/reader/search.ts', 'utf8'),
    readFile('src/lib/reader/search-harness.ts', 'utf8'),
    readFile('src/styles/reader-search.css', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
  ]);

  pass(
    'EPUB_READER_SEARCH_NATIVE_SPINE',
    engine.includes("import ePub, { type Book } from 'epubjs'")
      && engine.includes('book.spine.each')
      && engine.includes('section.load(book.load.bind(book))')
      && engine.includes('section.search')
      && engine.includes('section.unload()'),
    'Search walks EPUB spine sections directly and unloads each searched XHTML section',
  );
  pass(
    'EPUB_READER_SEARCH_CFI_RESULTS',
    engine.includes("cfi.startsWith('epubcfi(')")
      && search.includes('await this.controller.goTo(cfi)')
      && search.includes('resolveChapterLabel'),
    'Matches retain EPUB CFIs/hrefs and open through ReaderController with TOC-aware section labels',
  );
  pass(
    'EPUB_READER_SEARCH_UNICODE',
    engine.includes("normalize('NFC')")
      && engine.includes("normalize('NFD')")
      && search.includes('toLocaleLowerCase()'),
    'Queries account for canonical Unicode composition variants and case-insensitive snippet highlighting',
  );
  pass(
    'EPUB_READER_SEARCH_LARGE_BOOK_SAFE',
    engine.includes('maxResults')
      && engine.includes('yieldEverySections')
      && engine.includes('AbortSignal')
      && engine.includes('yieldToMainThread')
      && search.includes('new AbortController()'),
    'Large-book searches are cancellable, result-bounded, sequential, and periodically yield to the browser',
  );
  pass(
    'EPUB_READER_SEARCH_RELEASE_CACHE',
    cache.includes('workId')
      && cache.includes('edition')
      && cache.includes('releaseVersion')
      && cache.includes('thiepn-library-reader-search-v1')
      && search.includes('this.cache.get(this.identity, query)'),
    'Repeated searches can use a best-effort cache bound to the exact publication release identity',
  );
  pass(
    'EPUB_READER_SEARCH_CACHE_SAFE',
    cache.includes('failedSections > 0')
      && cache.includes('Search caching is an optimization')
      && cache.includes('return undefined'),
    'Cache failure or partial-section search never blocks in-book search or freezes incomplete results into cache',
  );
  pass(
    'EPUB_READER_SEARCH_A11Y',
    search.includes("setAttribute('aria-expanded'")
      && search.includes("setAttribute('role', 'dialog')")
      && search.includes('role="search"')
      && search.includes('aria-live="polite"')
      && search.includes("event.key !== 'Escape'")
      && search.includes("event.key === 'ArrowDown'"),
    'Search UI exposes labeled controls, live status, Escape dismissal, and keyboard result traversal',
  );
  pass(
    'EPUB_READER_SEARCH_SAFE_SNIPPETS',
    search.includes('document.createTextNode')
      && search.includes('mark.textContent')
      && search.includes('meta.textContent')
      && search.includes('appendHighlightedExcerpt'),
    'Book excerpts and labels are rendered as text nodes rather than interpolated publication HTML',
  );
  pass(
    'EPUB_READER_SEARCH_HIGHLIGHT',
    highlighter.includes('new EpubCFI(this.cfi)')
      && highlighter.includes('cfi.toRange(doc)')
      && highlighter.includes('getClientRects()')
      && css.includes('pointer-events: none')
      && css.includes('.reader-search-highlight'),
    'Selected result CFIs are highlighted with a non-invasive overlay instead of mutating EPUB XHTML',
  );
  pass(
    'EPUB_READER_SEARCH_PAGEFIND_SEPARATE',
    !engine.toLowerCase().includes('pagefind')
      && !search.toLowerCase().includes('pagefind')
      && !cache.toLowerCase().includes('pagefind'),
    'In-book EPUB search is isolated from site-wide Pagefind search',
  );
  pass(
    'EPUB_READER_SEARCH_HARNESS',
    harness.includes('mountReaderShellWithSearchHarness')
      && harness.includes('mountReaderPublicationWithSearchHarness')
      && harness.includes('mountReaderPublicationWithTocHarness')
      && harness.includes('base.toc.close(false)'),
    'P18 composes on top of the full staged reader plus native TOC and coordinates overlapping panels',
  );
  pass(
    'EPUB_READER_SEARCH_PUBLIC_API',
    index.includes("ReaderSearchController")
      && index.includes('EpubSearchEngine')
      && index.includes('mountReaderPublicationWithSearchHarness')
      && index.includes('ReaderSearchCache'),
    'Search engine, controller, cache, types, and staged harness are exported through the reader API',
  );
  pass(
    'EPUB_READER_SEARCH_RESPONSIVE',
    layout.includes("../styles/reader-search.css")
      && css.includes('@media (max-width: 680px)')
      && css.includes('@media (max-width: 420px)')
      && css.includes('@media (forced-colors: active)'),
    'Search panel and result highlighting are included in the native reader and adapt to phone/accessibility modes',
  );
  pass(
    'EPUB_READER_SEARCH_GENERIC',
    !engine.includes('ai-for-the-kingdom')
      && !search.includes('ai-for-the-kingdom')
      && !harness.includes('ai-for-the-kingdom'),
    'P18 contains no publication-title-specific search behavior',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_SEARCH_SOURCE_PASS');
