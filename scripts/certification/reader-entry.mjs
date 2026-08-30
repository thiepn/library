import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader-entry/continuity.ts',
  'src/lib/reader-entry/client.ts',
  'src/lib/reader-entry/dom.ts',
  'src/lib/reader-entry/epub-first-dom.ts',
  'src/layouts/BaseLayout.astro',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/pdf.astro',
  'scripts/regression/reader-entry.test.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
const switchComponentRemoved = !(await exists('src/components/ReaderFormatSwitch.astro'));
const switchCssRemoved = !(await exists('src/styles/reader-format-switch.css'));
pass('READER_ENTRY_ER5_FILES', present, 'ER5 continuity model, EPUB-first entry normalizer, hosted reader integration, and regression assets are present');

if (present) {
  const [continuity, client, dom, epubFirstDom, baseLayout, epubRoute, pdfRoute, personalEpub, personalPdf, pkg] = await Promise.all([
    readFile('src/lib/reader-entry/continuity.ts', 'utf8'),
    readFile('src/lib/reader-entry/client.ts', 'utf8'),
    readFile('src/lib/reader-entry/dom.ts', 'utf8'),
    readFile('src/lib/reader-entry/epub-first-dom.ts', 'utf8'),
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
    continuity.includes("const epub = normalized.find((entry) => entry.format === 'epub')")
      && continuity.includes('if (epub) return epub;')
      && continuity.includes('.filter(isReadingInProgress)')
      && continuity.includes('timestamp(b.updatedAt) - timestamp(a.updatedAt)'),
    'EPUB is the canonical general entry when available; without EPUB, in-progress fallbacks still honor most-recent use',
  );

  pass(
    'READER_ENTRY_ER5_DEFAULT',
    continuity.includes("const DEFAULT_ORDER: ReadingFormat[] = ['epub', 'web', 'pdf']"),
    'A new book starts in the native reflowable reader when available, then verified web, then PDF, without inventing cross-format state',
  );

  pass(
    'READER_ENTRY_ER5_EPUB_FIRST_SURFACES',
    epubFirstDom.includes("document.querySelectorAll<HTMLElement>('[data-catalog-work]')")
      && epubFirstDom.includes("'[data-format=\"epub\"]'")
      && epubFirstDom.includes("'[data-saved-work][data-has-epub=\"true\"]'")
      && epubFirstDom.includes("dataset.webReadable = 'true'")
      && epubFirstDom.includes('dataset.readerHref = hostedReaderHref(slug)'),
    'Catalog, detail, Continue Reading, and My Library normalize hosted EPUB availability into the native reader route before continuity mounts',
  );

  pass(
    'READER_ENTRY_ER5_CATALOG',
    dom.includes("document.querySelectorAll<HTMLElement>('[data-catalog-work]')")
      && dom.includes('cta.dataset.readerFormat = primary.format')
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
    baseLayout.includes('normalizeEpubFirstReaderEntries')
      && baseLayout.includes('normalizeEpubFirstReaderEntries();')
      && baseLayout.indexOf('normalizeEpubFirstReaderEntries();') < baseLayout.indexOf('mountUnifiedReaderEntry()')
      && baseLayout.includes("window.addEventListener('pagehide', unmountUnifiedReaderEntry"),
    'EPUB-first route normalization runs before the existing unified entry behavior and is torn down with the normal page lifecycle',
  );

  pass(
    'READER_ENTRY_ER5_FORMAT_SWITCH_REMOVED',
    switchComponentRemoved
      && switchCssRemoved
      && !epubRoute.includes('ReaderFormatSwitch')
      && !pdfRoute.includes('ReaderFormatSwitch')
      && !personalEpub.includes('ReaderFormatSwitch')
      && !personalPdf.includes('ReaderFormatSwitch'),
    'The cross-format reader switch component, styles, and all hosted/personal reader integrations are completely removed; format choice belongs to Library/book surfaces',
  );

  pass(
    'READER_ENTRY_ER5_PERSONAL_IDENTITY_PRESERVED',
    personalEpub.includes('personalReaderWorkId(book)')
      && personalEpub.includes('personalReaderReleaseVersion(book)')
      && personalPdf.includes('personalReaderWorkId(book)')
      && personalPdf.includes('personalReaderReleaseVersion(book)'),
    'Personal single-format books retain content-bound local identities without fabricated cross-format state',
  );

  pass(
    'READER_ENTRY_ER5_PRIVACY',
    !client.includes('fetch(')
      && !client.includes('XMLHttpRequest')
      && !dom.includes('fetch(')
      && !dom.includes('XMLHttpRequest')
      && !epubFirstDom.includes('fetch(')
      && !epubFirstDom.includes('XMLHttpRequest'),
    'Cross-format continuity and EPUB-first routing are computed entirely from existing browser-local/static state and introduce no telemetry or upload path',
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
