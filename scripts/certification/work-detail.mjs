import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/pages/works/[slug].astro',
  'src/styles/work-detail.css',
  'src/lib/reader-entry/dom.ts',
  'src/lib/reader-entry/client.ts',
  'src/lib/reader-entry/continuity.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('BOOK_DETAIL_P16', present, 'Reader-first book detail page, responsive styles, and ER5 continuity boundary are present');

if (present) {
  const [page, css, dom, client, continuity] = await Promise.all([
    readFile('src/pages/works/[slug].astro', 'utf8'),
    readFile('src/styles/work-detail.css', 'utf8'),
    readFile('src/lib/reader-entry/dom.ts', 'utf8'),
    readFile('src/lib/reader-entry/client.ts', 'utf8'),
    readFile('src/lib/reader-entry/continuity.ts', 'utf8'),
  ]);

  pass(
    'BOOK_DETAIL_NO_TITLE_EXCEPTIONS',
    !page.includes("work.id === 'ai-for-the-kingdom'") && !page.includes('restoring') && !page.includes('Edition restoration'),
    'Book pages contain no title-specific restoration logic or restoration-status copy',
  );
  pass(
    'BOOK_DETAIL_RELEASE_FORMATS',
    page.includes('const release = work.release')
      && page.includes('release?.artifacts.pdf')
      && page.includes('release?.artifacts.epub')
      && page.includes("epub ? 'EPUB' : null")
      && page.includes("pdf ? 'PDF' : null"),
    'PDF and EPUB availability remains derived from the active validated release while the UI presents reader-facing format status',
  );
  pass(
    'BOOK_DETAIL_READER_ROUTE_SAFE',
    page.includes('const readHref = work.webMaterialized')
      && page.includes('This book is not currently available in the Library reader.')
      && dom.includes("root.querySelector<HTMLAnchorElement>('[data-format=\"web\"] a')"),
    'The public reader action remains gated by a materialized reader route before ER5 considers it for unified entry',
  );
  pass(
    'BOOK_DETAIL_INTELLIGENT_CTA',
    dom.includes('getReadingContinuity(request)')
      && dom.includes('readingActionLabel(primary)')
      && continuity.includes("return 'Start reading'")
      && continuity.includes("'Continue reading'")
      && continuity.includes("'Read again'"),
    'The primary action distinguishes start, continue, and reread across exact EPUB/PDF/web continuity state',
  );
  pass(
    'BOOK_DETAIL_NATIVE_PROGRESS_RELEASE_BOUND',
    client.includes('getReaderProgress(request.workId)')
      && client.includes('epubProgress.edition === identity.edition')
      && client.includes('epubProgress.releaseVersion === identity.releaseVersion')
      && client.includes('furthestPercentage'),
    'Native EPUB progress remains exact-edition/release bound behind the ER5 continuity adapter',
  );
  pass(
    'BOOK_DETAIL_PROGRESS_VISUAL',
    page.includes('data-publication-progress')
      && page.includes('data-progress-furthest')
      && dom.includes('renderTrack(progressPanel, progress')
      && css.includes('.book-detail__progress-track'),
    'Book page presents current and furthest reading progress without conflating them',
  );
  pass(
    'BOOK_DETAIL_FORMAT_ACTIONS',
    page.includes('Download EPUB')
      && page.includes('View PDF')
      && page.includes('Open reader')
      && page.includes('formatBytes')
      && dom.includes("entryFor(snapshot, 'epub')")
      && dom.includes("entryFor(snapshot, 'pdf')"),
    'Available formats keep explicit reader/download/PDF actions while ER5 annotates each integrated format with its own saved position',
  );
  pass(
    'BOOK_DETAIL_READER_METADATA_HIERARCHY',
    page.includes('Book details')
      && page.includes('First published')
      && page.includes('Last updated')
      && page.includes('Subjects')
      && page.includes('Collections')
      && page.includes('Available formats')
      && !page.includes('Release version')
      && !page.includes('Verified release')
      && !page.includes('No active binary release'),
    'Book details expose useful reader metadata without release-engineering terminology',
  );
  pass(
    'BOOK_DETAIL_SAVE_LIBRARY',
    page.includes('toggleFavorite') && page.includes('aria-pressed') && page.includes('Add to My Library') && page.includes('Remove from My Library'),
    'My Library save behavior remains available and accessible after reframing',
  );
  pass(
    'BOOK_DETAIL_RESPONSIVE',
    css.includes('@media (max-width: 980px)') && css.includes('@media (max-width: 800px)') && css.includes('@media (max-width: 560px)') && css.includes('@media (forced-colors: active)'),
    'Cover, formats, metadata, actions, and progress adapt across desktop, tablet, phone, and forced-colors modes',
  );
  pass(
    'BOOK_DETAIL_COVER_TREATMENT',
    css.includes('.book-detail__cover-frame') && css.includes('position: sticky') && page.includes('book-detail__cover-caption'),
    'The book cover retains its dedicated editorial treatment and edition context',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('WORK_DETAIL_SOURCE_PASS');
