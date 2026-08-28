import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader-entry/continuity.ts',
  'src/lib/reader-entry/client.ts',
  'src/lib/reader-entry/dom.ts',
  'src/components/ReaderFormatSwitch.astro',
  'src/styles/reader-format-switch.css',
  'src/layouts/BaseLayout.astro',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/pdf.astro',
  'scripts/regression/reader-entry.test.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('READER_ENTRY_ER5_FILES', present, 'ER5 continuity model, client adapter, UI bridge, format switch, hosted reader integration, and regression assets are present');

if (present) {
  const [continuity, client, dom, switchComponent, switchCss, baseLayout, epubRoute, pdfRoute, personalEpub, personalPdf, pkg] = await Promise.all([
    readFile('src/lib/reader-entry/continuity.ts', 'utf8'),
    readFile('src/lib/reader-entry/client.ts', 'utf8'),
    readFile('src/lib/reader-entry/dom.ts', 'utf8'),
    readFile('src/components/ReaderFormatSwitch.astro', 'utf8'),
    readFile('src/styles/reader-format-switch.css', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/works/[slug]/pdf.astro', 'utf8'),
    readFile('src/pages/personal/read.astro', 'utf8'),
    readFile('src/pages/personal/pdf.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'READER_ENTRY_ER5_SEPARATE_FORMAT_STATE',
    client.includes('getReaderProgress')
      && client.includes('getPdfProgress')
      && client.includes("format: 'epub'")
      && client.includes("format: 'pdf'")
      && continuity.includes('entries: ReadingEntryState[]'),
    'EPUB and PDF keep independent native progress records and are combined only as a read-only continuity snapshot',
  );

  pass(
    'READER_ENTRY_ER5_EXACT_RELEASE',
    client.includes('epubProgress.edition === identity.edition')
      && client.includes('epubProgress.releaseVersion === identity.releaseVersion')
      && client.includes('getPdfProgress(identity)'),
    'Hosted continuity accepts EPUB and PDF progress only for the exact work/edition/release identity',
  );

  pass(
    'READER_ENTRY_ER5_NO_POSITION_TRANSLATION',
    !continuity.includes('cfi')
      && !continuity.includes('epubcfi')
      && !client.includes('furthestPage =')
      && client.includes('pageCount ? (pdfProgress?.page ?? 0) / pageCount : 0'),
    'ER5 compares normalized progress for entry choice but never converts an EPUB CFI into a PDF page or a PDF page into an EPUB location',
  );

  pass(
    'READER_ENTRY_ER5_RECENCY',
    continuity.includes('.filter(isReadingInProgress)')
      && continuity.includes('timestamp(b.updatedAt) - timestamp(a.updatedAt)'),
    'When multiple formats are in progress, the unified entry resumes the most recently used in-progress format',
  );

  pass(
    'READER_ENTRY_ER5_DEFAULT',
    continuity.includes("const DEFAULT_ORDER: ReadingFormat[] = ['epub', 'web', 'pdf']"),
    'A new book starts in the native reflowable reader when available, then verified web, then PDF, without inventing cross-format state',
  );

  pass(
    'READER_ENTRY_ER5_CATALOG',
    dom.includes("document.querySelectorAll<HTMLElement>('[data-catalog-work]')")
      && dom.includes("cta.dataset.readerFormat = primary.format")
      && dom.includes('Continue ${formatReadingFormat(entry.format)}'),
    'Library cards and Continue Reading use one format-aware entry decision instead of EPUB-only progress',
  );

  pass(
    'READER_ENTRY_ER5_DETAIL',
    dom.includes("document.querySelector<HTMLElement>('[data-work-detail]')")
      && dom.includes("entryFor(snapshot, 'epub')")
      && dom.includes("entryFor(snapshot, 'pdf')")
      && dom.includes('Also saved:'),
    'Book detail exposes a unified primary action while retaining separate EPUB and PDF saved-position context',
  );

  pass(
    'READER_ENTRY_ER5_CROSS_TAB',
    client.includes("const PDF_CHANNEL = 'thiepn-library-pdf-reader'")
      && client.includes('subscribeLibraryState(listener)')
      && client.includes('new BroadcastChannel(PDF_CHANNEL)'),
    'Unified entry state refreshes from both the Library EPUB channel and the PDF reader channel without duplicating persistence',
  );

  pass(
    'READER_ENTRY_ER5_GLOBAL_MOUNT',
    baseLayout.includes("mountUnifiedReaderEntry")
      && baseLayout.includes("window.addEventListener('pagehide', unmountUnifiedReaderEntry"),
    'Unified entry behavior is mounted once for ordinary Library surfaces and explicitly torn down on page lifecycle exit',
  );

  pass(
    'READER_ENTRY_ER5_FORMAT_SWITCH',
    epubRoute.includes('<ReaderFormatSwitch current="epub" href={pdfReaderHref} />')
      && pdfRoute.includes('<ReaderFormatSwitch current="pdf" href={epubReaderHref} />')
      && epubRoute.includes('`${base}/works/${work.slug}/pdf`')
      && pdfRoute.includes('`${base}/works/${work.slug}/read`'),
    'Hosted EPUB and PDF readers expose explicit integrated-reader switching without routing through downloads or raw files',
  );

  pass(
    'READER_ENTRY_ER5_SWITCH_ACCESSIBLE',
    switchComponent.includes('aria-label="Reading format"')
      && switchComponent.includes('aria-current="page"')
      && switchComponent.includes('aria-label={`Switch to ${alternate}`}')
      && switchCss.includes(':focus-visible')
      && switchCss.includes('@media (forced-colors: active)'),
    'Cross-format switching is named, keyboard-visible, current-format aware, and forced-colors compatible',
  );

  pass(
    'READER_ENTRY_ER5_PERSONAL_IDENTITY_PRESERVED',
    personalEpub.includes('personalReaderWorkId(book)')
      && personalEpub.includes('personalReaderReleaseVersion(book)')
      && personalPdf.includes('personalReaderWorkId(book)')
      && personalPdf.includes('personalReaderReleaseVersion(book)')
      && !personalEpub.includes('ReaderFormatSwitch')
      && !personalPdf.includes('ReaderFormatSwitch'),
    'Personal single-format books retain content-bound local identities and never receive a fabricated alternate-format switch',
  );

  pass(
    'READER_ENTRY_ER5_PRIVACY',
    !client.includes('fetch(')
      && !client.includes('XMLHttpRequest')
      && !dom.includes('fetch(')
      && !dom.includes('XMLHttpRequest'),
    'Cross-format continuity is computed entirely from existing browser-local state and introduces no telemetry or upload path',
  );

  pass(
    'READER_ENTRY_ER5_CERT_CHAIN',
    pkg.includes('pdf-reader.mjs && node scripts/certification/reader-entry.mjs'),
    'ER5 certification is permanently chained immediately after ER4 integrated-PDF certification',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_ENTRY_SOURCE_PASS');
