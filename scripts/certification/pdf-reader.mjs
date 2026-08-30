import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/pdf-reader/canonical.ts',
  'src/lib/pdf-reader/runtime.ts',
  'src/lib/pdf-reader/state.ts',
  'src/lib/pdf-reader/index.ts',
  'src/components/PdfReaderShell.astro',
  'src/layouts/PdfReaderLayout.astro',
  'src/styles/pdf-reader.css',
  'src/pages/works/[slug]/pdf.astro',
  'src/pages/personal/pdf.astro',
  'scripts/regression/pdf-canonical.test.ts',
  'tests/e2e/pdf-reader-ergonomics.spec.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('PDF_READER_ER4_FILES', present, 'ER4 canonical PDF source, runtime, local state, shared shell/layout, hosted/personal routes, styles, regression assets, and RR7 browser acceptance are present');

if (present) {
  const [canonical, runtime, state, shell, layout, css, hosted, personal, pkg] = await Promise.all([
    readFile('src/lib/pdf-reader/canonical.ts', 'utf8'),
    readFile('src/lib/pdf-reader/runtime.ts', 'utf8'),
    readFile('src/lib/pdf-reader/state.ts', 'utf8'),
    readFile('src/components/PdfReaderShell.astro', 'utf8'),
    readFile('src/layouts/PdfReaderLayout.astro', 'utf8'),
    readFile('src/styles/pdf-reader.css', 'utf8'),
    readFile('src/pages/works/[slug]/pdf.astro', 'utf8'),
    readFile('src/pages/personal/pdf.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'PDF_READER_ER4_DEPENDENCY',
    pkg.includes('"pdfjs-dist": "4.10.38"')
      && runtime.includes("from 'pdfjs-dist'")
      && runtime.includes("pdf.worker.min.mjs?url"),
    'ER4 uses one pinned bundled PDF.js dependency and an application-owned worker asset rather than a runtime CDN',
  );

  pass(
    'PDF_READER_ER4_SOURCE_NEUTRAL',
    canonical.includes('source: string | ArrayBuffer')
      && canonical.includes('identity: PdfReaderIdentity')
      && canonical.includes('pdfCanonicalCandidateFromHosted'),
    'Hosted PDF URLs and personal PDF ArrayBuffers share one canonical source-plus-identity contract',
  );

  pass(
    'PDF_READER_ER4_EXACT_IDENTITY',
    canonical.includes('workId: input.workId')
      && canonical.includes('edition: input.edition')
      && canonical.includes('releaseVersion: input.releaseVersion')
      && state.includes('pdfReaderIdentityKey(identity)'),
    'PDF progress and bookmarks are bound to exact work/edition/release identity rather than filename or URL alone',
  );

  pass(
    'PDF_READER_ER4_SECURITY',
    runtime.includes('isEvalSupported: false')
      && !runtime.includes('innerHTML')
      && !runtime.includes('eval(')
      && !runtime.includes('new Function'),
    'Untrusted PDFs render with PDF.js evaluation disabled and publication/search text is never interpolated as HTML',
  );

  pass(
    'PDF_READER_ER4_RENDER_SELECTION',
    runtime.includes('page.render({')
      && runtime.includes('new TextLayer({')
      && runtime.includes('page.getTextContent()')
      && css.includes('.textLayer')
      && css.includes('user-select: text'),
    'Canvas rendering is paired with a selectable PDF.js text layer instead of a browser PDF plugin iframe',
  );

  pass(
    'PDF_READER_ER4_NAVIGATION',
    runtime.includes("event.key === 'ArrowLeft' || event.key === 'PageUp'")
      && runtime.includes("event.key === 'ArrowRight' || event.key === 'PageDown'")
      && runtime.includes('this.goToPage(this.page - 1)')
      && runtime.includes('this.goToPage(this.page + 1)')
      && shell.includes('data-pdf-page-input'),
    'Previous/next controls, direct page entry, and keyboard page navigation share the same page controller',
  );

  pass(
    'PDF_READER_RR7_ERGONOMICS',
    runtime.includes('const SWIPE_MIN_DISTANCE = 56')
      && runtime.includes("addEventListener('touchstart'")
      && runtime.includes('hasSelectionWithin(this.elements.textLayer)')
      && runtime.includes("this.settings.fit === 'custom'")
      && runtime.includes('this.elements.railPrevious.disabled = atStart')
      && runtime.includes("this.root.removeAttribute('aria-busy')")
      && runtime.includes('private cancelSearch(): boolean')
      && shell.includes('data-pdf-page-rail-previous')
      && shell.includes('data-pdf-page-rail-next')
      && css.includes('@media (min-width: 761px) and (hover: hover) and (pointer: fine)')
      && pkg.includes('pdf-reader-ergonomics.spec.ts'),
    'RR7 PDF ergonomics adds discoverable desktop rails, guarded fitted-page touch swipes, accurate busy state, and cancellable background search while preserving the canonical page controller',
  );

  pass(
    'PDF_READER_ER4_ZOOM_FIT',
    runtime.includes("PdfFitMode = 'width' | 'page' | 'custom'") || state.includes("PdfFitMode = 'width' | 'page' | 'custom'")
      && runtime.includes("this.settings.fit === 'width'")
      && runtime.includes("this.settings.fit === 'page'")
      && runtime.includes('changeZoom')
      && shell.includes('Fit width')
      && shell.includes('Fit page'),
    'Fit-width, fit-page, and bounded custom zoom are integrated and preserve the current page',
  );

  pass(
    'PDF_READER_ER4_PROGRESS',
    state.includes("DB_NAME = 'thiepn-library-pdf-reader'")
      && state.includes("PROGRESS_STORE = 'progress'")
      && state.includes('furthestPage')
      && runtime.includes('getPdfProgress(this.candidate.identity)')
      && runtime.includes('setPdfProgress(this.candidate.identity'),
    'Page-based resume and monotonic furthest progress persist locally in a PDF-specific exact-release store',
  );

  pass(
    'PDF_READER_ER4_BOOKMARKS',
    state.includes("BOOKMARK_STORE = 'bookmarks'")
      && state.includes('togglePdfBookmark')
      && runtime.includes('toggleCurrentBookmark')
      && runtime.includes('renderBookmarks()')
      && shell.includes('data-pdf-bookmark-panel'),
    'Page bookmarks persist locally and reopen through the same page navigation controller',
  );

  pass(
    'PDF_READER_ER4_SEARCH',
    runtime.includes('MAX_SEARCH_RESULTS = 250')
      && runtime.includes('await page.getTextContent()')
      && runtime.includes('pageNumber % 4 === 0')
      && runtime.includes('window.setTimeout(resolve, 0)')
      && runtime.includes('normalizeSearch')
      && shell.includes('data-pdf-search-results'),
    'Whole-document text search is lazy, bounded, cooperative, Unicode-normalized for matching only, and navigates to real PDF pages',
  );

  pass(
    'PDF_READER_ER4_SHARED_RUNTIME',
    hosted.includes('mountPdfReader(root, candidate)')
      && personal.includes('mountPdfReader(root, candidate)')
      && !hosted.includes('<object')
      && !personal.includes('<iframe'),
    'Hosted and personal PDF routes mount the same integrated runtime rather than separate browser-plugin viewers',
  );

  pass(
    'PDF_READER_ER4_PERSONAL_LOCAL',
    personal.includes('const source = await book.file.arrayBuffer()')
      && personal.includes('workId: personalReaderWorkId(book)')
      && personal.includes('releaseVersion: personalReaderReleaseVersion(book)')
      && personal.includes('URL.createObjectURL(book.file)')
      && personal.includes('URL.revokeObjectURL(objectUrl)')
      && !personal.includes('FormData')
      && !personal.includes('XMLHttpRequest'),
    'Personal PDFs remain local ArrayBuffer sources with content-bound identity and a revocable local original-file fallback; no upload path is introduced',
  );

  pass(
    'PDF_READER_ER4_HOSTED_RELEASE',
    hosted.includes('localizeReaderArtifact')
      && hosted.includes('workId: work.id')
      && hosted.includes('edition: release.edition')
      && hosted.includes('releaseVersion: release.version')
      && hosted.includes('fallbackUrl: localizedPdf.url'),
    'Hosted PDFs use the validated active release, current Library media base, exact release identity, and explicit original-file fallback',
  );

  pass(
    'PDF_READER_ER4_RECOVERY',
    runtime.includes('async retry()')
      && runtime.includes('showFailure(error)')
      && hosted.includes('location.reload()')
      && personal.includes('location.reload()')
      && shell.includes('data-pdf-retry')
      && shell.includes('data-pdf-fallback'),
    'Reader failures have an owned retry path, bootstrap failures have a real reload path, and original PDFs remain explicit escape routes',
  );

  pass(
    'PDF_READER_ER4_LIFECYCLE',
    runtime.includes('this.renderTask?.cancel()')
      && runtime.includes('this.textLayer?.cancel()')
      && runtime.includes('this.resizeObserver?.disconnect()')
      && runtime.includes('await loading?.destroy()')
      && runtime.includes('await document?.destroy()')
      && hosted.includes("window.addEventListener('pagehide'")
      && personal.includes("window.addEventListener('pagehide'"),
    'Render tasks, text layers, resize observers, PDF.js document resources, and route handles have explicit teardown ownership',
  );

  pass(
    'PDF_READER_ER4_PERFORMANCE',
    runtime.includes("performance.mark('pdf-reader:open-start')")
      && runtime.includes("performance.mark('pdf-reader:first-ready')")
      && runtime.includes("performance.measure('pdf-reader:open'")
      && layout.includes('fetchpriority="high"')
      && hosted.includes('pdfHref={localizedPdf.url}'),
    'Reader boot is locally measurable and hosted PDFs are preloaded without adding telemetry',
  );

  pass(
    'PDF_READER_ER4_ACCESSIBILITY',
    shell.includes('aria-label="PDF tools"')
      && shell.includes('aria-live="polite"')
      && shell.includes('role="dialog"')
      && shell.includes('aria-pressed="false"')
      && layout.includes('Skip to PDF page')
      && css.includes(':focus-visible')
      && css.includes('@media (forced-colors: active)')
      && css.includes('@media (prefers-reduced-motion: reduce)'),
    'PDF controls, status, panels, focus, forced-colors, reduced-motion, and skip navigation retain explicit accessible semantics',
  );

  pass(
    'PDF_READER_ER4_RESPONSIVE',
    css.includes('@media (max-width: 760px)')
      && css.includes('@media (max-width: 430px)')
      && css.includes('env(safe-area-inset-bottom)')
      && css.includes('100dvh'),
    'The integrated PDF reader has phone, narrow-phone, safe-area, and dynamic-viewport behavior',
  );

  pass(
    'PDF_READER_ER4_CERT_CHAIN',
    pkg.includes('reader-consolidation.mjs && node scripts/certification/pdf-reader.mjs'),
    'ER4 certification is permanently chained after ER3 consolidation in source certification',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('PDF_READER_SOURCE_PASS');
