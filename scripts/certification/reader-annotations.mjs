import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/annotation-store.ts',
  'src/lib/reader/annotation-highlighter.ts',
  'src/lib/reader/annotations.ts',
  'src/lib/reader/annotations-harness.ts',
  'src/styles/reader-annotations.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_ANNOTATIONS_P20', present, 'P20 native EPUB highlights and notes subsystem is present');

if (present) {
  const [store, highlighter, annotations, harness, css, index, layout, db, pkg] = await Promise.all([
    readFile('src/lib/reader/annotation-store.ts', 'utf8'),
    readFile('src/lib/reader/annotation-highlighter.ts', 'utf8'),
    readFile('src/lib/reader/annotations.ts', 'utf8'),
    readFile('src/lib/reader/annotations-harness.ts', 'utf8'),
    readFile('src/styles/reader-annotations.css', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'EPUB_READER_ANNOTATION_EXISTING_STORE',
    store.includes("openLibraryDb") && store.includes("objectStoreNames.contains('annotations')") && db.includes('const DB_VERSION = 7'),
    'Native annotations continue to reuse the existing annotations store unchanged through the non-destructive P29 IndexedDB v7 upgrade',
  );
  pass(
    'EPUB_READER_ANNOTATION_RELEASE_IDENTITY',
    store.includes('workId: string') && store.includes('edition: number') && store.includes('releaseVersion: string')
      && annotations.includes('annotation.edition === this.identity.edition')
      && annotations.includes('annotation.releaseVersion === this.identity.releaseVersion'),
    'Annotations are bound to exact work, edition, and release identity',
  );
  pass(
    'EPUB_READER_ANNOTATION_CFI_SELECTION',
    store.includes('cfiRange: string') && annotations.includes('this.controller.onSelection')
      && annotations.includes("selection.cfiRange.startsWith('epubcfi('")
      && annotations.includes('await this.controller.goTo(annotation.cfiRange)'),
    'Selections become CFI-range annotations and reopen through ReaderController',
  );
  pass(
    'EPUB_READER_ANNOTATION_VISUAL_RESTORE',
    highlighter.includes("import { EpubCFI } from 'epubjs'")
      && highlighter.includes('cfi.toRange(doc)')
      && highlighter.includes('getClientRects()')
      && annotations.includes('this.highlighter.set(nearby)')
      && css.includes('pointer-events: none'),
    'Saved CFI ranges restore as pointer-transparent visual highlights without mutating EPUB XHTML',
  );
  pass(
    'EPUB_READER_ANNOTATION_CREATE_NOTE_EDIT_DELETE',
    annotations.includes('Highlight') && annotations.includes('Add note')
      && annotations.includes('beginEdit') && annotations.includes('saveEditor')
      && annotations.includes('deleteReaderAnnotation'),
    'P20 supports highlight creation, note creation/editing, and deletion',
  );
  pass(
    'EPUB_READER_ANNOTATION_STORAGE_SAFE',
    annotations.includes("storageMode: 'session'")
      && annotations.includes('Browser storage is unavailable')
      && store.includes('Cross-tab annotation refresh is best-effort'),
    'IndexedDB failure degrades to session-only annotations and never blocks reading',
  );
  pass(
    'EPUB_READER_ANNOTATION_STALE_SAFE',
    annotations.includes('staleCount')
      && annotations.includes('from another edition or release are kept separately')
      && annotations.includes('matchesRelease'),
    'Annotations from stale releases remain preserved but are not opened against the current EPUB',
  );
  pass(
    'EPUB_READER_ANNOTATION_SAFE_TEXT',
    annotations.includes('quote.textContent = item.quote')
      && annotations.includes('note.textContent = item.note')
      && annotations.includes('this.ui.editorQuote.textContent'),
    'Publication quotes and notes are rendered as text rather than interpolated HTML',
  );
  pass(
    'EPUB_READER_ANNOTATION_A11Y',
    annotations.includes("setAttribute('aria-expanded'")
      && annotations.includes("setAttribute('role', 'dialog')")
      && annotations.includes("setAttribute('role', 'toolbar')")
      && annotations.includes("event.key !== 'Escape'")
      && annotations.includes("event.key === 'ArrowDown'"),
    'Annotation controls expose dialog/toolbar semantics, Escape dismissal, live status, and keyboard list navigation',
  );
  pass(
    'EPUB_READER_ANNOTATION_PANEL_COORDINATION',
    harness.includes('base.bookmarks.close(false)')
      && harness.includes('base.search.close(false)')
      && harness.includes('base.toc.close(false)')
      && harness.includes('annotations.dismissSelection()'),
    'Highlights and notes coordinate with bookmarks, Search, and Contents instead of stacking reader panels',
  );
  pass(
    'EPUB_READER_ANNOTATION_HARNESS',
    harness.includes('mountReaderShellWithAnnotationsHarness')
      && harness.includes('mountReaderPublicationWithAnnotationsHarness')
      && harness.includes('mountReaderPublicationWithBookmarksHarness'),
    'P20 composes on top of the complete P19 staged reader and keeps publication identity generic',
  );
  pass(
    'EPUB_READER_ANNOTATION_PUBLIC_API',
    index.includes('ReaderAnnotationsController')
      && index.includes('ReaderAnnotationHighlighter')
      && index.includes('mountReaderPublicationWithAnnotationsHarness')
      && index.includes('getReaderAnnotationsForWork'),
    'Annotation storage, controller, highlighter, types, and staged harness are exported through the reader API',
  );
  pass(
    'EPUB_READER_ANNOTATION_RESPONSIVE',
    layout.includes("../styles/reader-annotations.css")
      && css.includes('@media (max-width: 680px)')
      && css.includes('@media (max-width: 420px)')
      && css.includes('@media (forced-colors: active)'),
    'Annotation UI and highlight rendering are included in the staged reader with phone and forced-colors behavior',
  );
  pass(
    'EPUB_READER_ANNOTATION_CERT_CHAIN',
    pkg.includes('reader-bookmarks.mjs && node scripts/certification/reader-annotations.mjs'),
    'P20 certification is permanently chained after P19 in certify:source',
  );
  pass(
    'EPUB_READER_ANNOTATION_GENERIC',
    !annotations.includes('ai-for-the-kingdom') && !store.includes('ai-for-the-kingdom') && !harness.includes('ai-for-the-kingdom'),
    'P20 contains no publication-title-specific annotation behavior',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_ANNOTATIONS_SOURCE_PASS');
