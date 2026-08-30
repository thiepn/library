import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/bookmark-store.ts',
  'src/lib/reader/bookmarks.ts',
  'src/lib/reader/bookmarks-harness.ts',
  'src/styles/reader-bookmarks.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_BOOKMARKS_P19', present, 'P19 CFI-native bookmark storage, controller, harness, and styles are present');

if (present) {
  const [store, bookmarks, harness, css, index, layout, db] = await Promise.all([
    readFile('src/lib/reader/bookmark-store.ts', 'utf8'),
    readFile('src/lib/reader/bookmarks.ts', 'utf8'),
    readFile('src/lib/reader/bookmarks-harness.ts', 'utf8'),
    readFile('src/styles/reader-bookmarks.css', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/client/library-db.ts', 'utf8'),
  ]);

  pass(
    'EPUB_READER_BOOKMARK_STORAGE_EXISTING',
    db.includes("['bookmarks', 'id']")
      && db.includes('const DB_VERSION = 9')
      && !db.includes("createObjectStore('bookmarks'")
      && store.includes("db.objectStoreNames.contains('bookmarks')"),
    'P19 continues to reuse the unchanged bookmarks store after the additive RR8 IndexedDB v9 record-versioning migration',
  );
  pass(
    'EPUB_READER_BOOKMARK_SCHEMA',
    store.includes('READER_BOOKMARK_SCHEMA_VERSION = 2')
      && store.includes('workId: string')
      && store.includes('edition: number')
      && store.includes('releaseVersion: string')
      && store.includes('cfi: string')
      && store.includes("record.cfi.startsWith('epubcfi(')"),
    'Native bookmark records are validated and carry exact publication identity plus EPUB CFI',
  );
  pass(
    'EPUB_READER_BOOKMARK_RELEASE_GUARD',
    bookmarks.includes('bookmark.edition === this.identity.edition')
      && bookmarks.includes('bookmark.releaseVersion === this.identity.releaseVersion')
      && bookmarks.includes('const staleCount = all.length - exact.length'),
    'Bookmarks from other editions/releases are retained but isolated from current EPUB navigation',
  );
  pass(
    'EPUB_READER_BOOKMARK_CFI_NAVIGATION',
    bookmarks.includes('await this.controller.goTo(bookmark.cfi)')
      && bookmarks.includes('resolveChapterLabel')
      && bookmarks.includes('spineIndex'),
    'Bookmark creation captures the current CFI and chapter context and opens through ReaderController',
  );
  pass(
    'EPUB_READER_BOOKMARK_TOGGLE',
    bookmarks.includes('toggleCurrent()')
      && bookmarks.includes("bookmark.cfi === location.cfi")
      && bookmarks.includes('putReaderBookmark(bookmark)')
      && bookmarks.includes('deleteReaderBookmark'),
    'Current reader location can be bookmarked or unbookmarked without page-route coupling',
  );
  pass(
    'EPUB_READER_BOOKMARK_STORAGE_SAFE',
    bookmarks.includes("storageMode: 'session'")
      && bookmarks.includes('Browser storage is unavailable')
      && bookmarks.includes('this.storageAvailable = false'),
    'IndexedDB failure degrades bookmarks to session-only state without blocking reading',
  );
  pass(
    'EPUB_READER_BOOKMARK_CROSS_TAB',
    store.includes("channel.postMessage({ kind: 'bookmarks'")
      && store.includes('subscribeReaderBookmarkChanges')
      && bookmarks.includes('subscribeReaderBookmarkChanges(this.identity.workId'),
    'Persistent bookmark changes refresh other Library tabs on a best-effort basis',
  );
  pass(
    'EPUB_READER_BOOKMARK_CONTROLS',
    bookmarks.includes("setAttribute('aria-expanded'")
      && bookmarks.includes("setAttribute('role', 'dialog')")
      && bookmarks.includes('aria-live="polite"')
      && bookmarks.includes('Filter bookmarks')
      && bookmarks.includes('Reading order')
      && bookmarks.includes("event.key !== 'Escape'"),
    'Bookmark panel supports accessible add/remove, filter, sort, Escape dismissal, and live status',
  );
  pass(
    'EPUB_READER_BOOKMARK_SAFE_LABELS',
    bookmarks.includes('label.textContent = bookmark.chapterLabel')
      && bookmarks.includes('meta.textContent = bookmarkMeta(bookmark)')
      && !bookmarks.includes('bookmark.chapterLabel}`</'),
    'Publication-derived bookmark labels render through textContent rather than interpolated HTML',
  );
  pass(
    'EPUB_READER_BOOKMARK_PANEL_COORDINATION',
    harness.includes('base.search.close(false)')
      && harness.includes('base.toc.close(false)')
      && harness.includes('if (state.open) bookmarks.close(false)'),
    'P19 coordinates bookmark, search, and contents panels instead of allowing overlapping reader drawers',
  );
  pass(
    'EPUB_READER_BOOKMARK_HARNESS',
    harness.includes('mountReaderShellWithBookmarksHarness')
      && harness.includes('mountReaderPublicationWithBookmarksHarness')
      && harness.includes('mountReaderPublicationWithSearchHarness'),
    'P19 composes on top of the complete staged P18 reader stack',
  );
  pass(
    'EPUB_READER_BOOKMARK_PUBLIC_API',
    index.includes('ReaderBookmarksController')
      && index.includes('ReaderBookmarkRecordV2')
      && index.includes('mountReaderPublicationWithBookmarksHarness')
      && index.includes('getReaderBookmarksForWork'),
    'Bookmark store, controller, record types, and staged harness are exported through the reader API',
  );
  pass(
    'EPUB_READER_BOOKMARK_RESPONSIVE',
    layout.includes("../styles/reader-bookmarks.css")
      && css.includes('@media (max-width: 680px)')
      && css.includes('@media (max-width: 420px)')
      && css.includes('@media (forced-colors: active)'),
    'Bookmark panel is included in the native reader and adapts across phone and accessibility modes',
  );
  pass(
    'EPUB_READER_BOOKMARK_SCOPE',
    !bookmarks.includes('AnnotationRecord')
      && !store.includes('annotations')
      && !bookmarks.includes('ai-for-the-kingdom')
      && !harness.includes('ai-for-the-kingdom'),
    'P19 remains bookmark-specific, generic across publications, and does not pre-implement P20 annotations',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_BOOKMARKS_SOURCE_PASS');
