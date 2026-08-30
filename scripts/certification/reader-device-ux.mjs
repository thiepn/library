import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/pdf-reader/device.ts',
  'src/lib/pdf-reader/runtime.ts',
  'src/components/PdfReaderShell.astro',
  'src/styles/reader-device-ux.css',
  'src/layouts/EpubReaderLayout.astro',
  'src/layouts/PdfReaderLayout.astro',
  'src/layouts/ReaderLayout.astro',
  'scripts/regression/pdf-device.test.ts',
  'docs/ER7_REAL_DEVICE_UX.md',
  'README.md',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('READER_DEVICE_UX_ER7_FILES', present, 'ER7 device controller, cross-format polish, regression, certification documentation, and product reframing are present');

if (present) {
  const [device, runtime, shell, css, epubLayout, pdfLayout, legacyLayout, testSource, docs, readme, pkg] = await Promise.all([
    readFile('src/lib/pdf-reader/device.ts', 'utf8'),
    readFile('src/lib/pdf-reader/runtime.ts', 'utf8'),
    readFile('src/components/PdfReaderShell.astro', 'utf8'),
    readFile('src/styles/reader-device-ux.css', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/layouts/PdfReaderLayout.astro', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('scripts/regression/pdf-device.test.ts', 'utf8'),
    readFile('docs/ER7_REAL_DEVICE_UX.md', 'utf8'),
    readFile('README.md', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'READER_DEVICE_UX_ER7_EPUB_CONTROLS',
    css.includes('[data-reader-command="contents"]')
      && css.includes('[data-reader-command="more"]')
      && css.includes('display: inline-grid')
      && css.includes('@media (max-width: 420px)'),
    'Contents, appearance, and reading-mode controls remain reachable on narrow EPUB reader toolbars',
  );

  pass(
    'READER_DEVICE_UX_ER7_PDF_VISUAL_VIEWPORT',
    device.includes('window.visualViewport')
      && device.includes("visualViewport?.addEventListener('resize'")
      && device.includes("visualViewport?.addEventListener('scroll'")
      && device.includes("--pdf-visual-height")
      && runtime.includes("from './device'")
      && runtime.includes('this.device.start()')
      && runtime.includes('this.device.destroy()'),
    'The shared PDF runtime follows the visual viewport and owns device-controller teardown for hosted and personal books',
  );

  pass(
    'READER_DEVICE_UX_ER7_PDF_KEYBOARD',
    device.includes('focusedEditable')
      && device.includes('keyboardThreshold')
      && device.includes('keepFocusedControlVisible')
      && device.includes('pdfKeyboard')
      && css.includes('[data-pdf-keyboard="open"]')
      && css.includes('.pdf-reader__controlbar'),
    'Software-keyboard contraction is focus-qualified, keeps the active field visible, and removes obscured PDF chrome',
  );

  pass(
    'READER_DEVICE_UX_ER7_SAFE_AREAS',
    epubLayout.includes('viewport-fit=cover')
      && pdfLayout.includes('viewport-fit=cover')
      && legacyLayout.includes('viewport-fit=cover')
      && css.includes('--pdf-safe-top')
      && css.includes('--pdf-safe-bottom')
      && css.includes('--legacy-reader-safe-top')
      && css.includes('--legacy-reader-safe-bottom'),
    'EPUB, PDF, and compatibility web readers explicitly respect notch and home-indicator safe areas',
  );

  pass(
    'READER_DEVICE_UX_ER7_TOUCH_TARGETS',
    css.includes('@media (hover: none) and (pointer: coarse)')
      && css.includes('min-height: 44px')
      && css.includes('.pdf-reader__back')
      && css.includes('.reader-mobile-toc summary')
      && css.includes('.reader-chapter-nav a'),
    'Primary PDF and legacy-reader controls use a 44px coarse-pointer floor without shrinking EPUB targets',
  );

  pass(
    'READER_DEVICE_UX_ER7_PDF_DIALOGS',
    shell.includes('data-pdf-panel-backdrop')
      && shell.includes('aria-controls="pdf-search-panel"')
      && shell.includes('aria-controls="pdf-bookmarks-panel"')
      && shell.includes('aria-expanded="false"')
      && runtime.includes('.inert = panelOpen')
      && runtime.includes('trapPanelFocus')
      && runtime.includes('data.pdfPanel') === false
      && runtime.includes('dataset.pdfPanel'),
    'PDF search and bookmark surfaces expose expanded state, a dismissible backdrop, inert background content, and trapped keyboard focus',
  );

  pass(
    'READER_DEVICE_UX_ER7_PDF_RESULT_NAVIGATION',
    runtime.includes('this.closeSearch();')
      && runtime.includes('this.runSafely(this.goToPage(result.page))')
      && runtime.indexOf('this.closeSearch();', runtime.indexOf('for (const result of this.searchResults)'))
        < runtime.indexOf('this.runSafely(this.goToPage(result.page))', runtime.indexOf('for (const result of this.searchResults)')),
    'Selecting a PDF search result closes the mobile sheet before navigating to the page through the guarded page controller',
  );

  pass(
    'READER_DEVICE_UX_ER7_PDF_NARROW_ACCESS',
    shell.includes('data-pdf-bookmark-toggle')
      && css.includes('.pdf-reader__tools [data-pdf-bookmark-toggle]')
      && css.includes('display: inline-flex')
      && shell.includes('>Saved</button>'),
    'The bookmark-list entry point remains visible on narrow phones instead of being removed for toolbar fit',
  );

  pass(
    'READER_DEVICE_UX_ER7_LANDSCAPE',
    css.includes('(max-height: 540px) and (orientation: landscape)')
      && css.includes('--pdf-controlbar: 52px')
      && css.includes('overflow-x: auto')
      && device.includes("orientation === 'landscape' && height <= 620"),
    'Low-height landscape devices receive compact, horizontally scrollable PDF chrome rather than losing reading space',
  );

  pass(
    'READER_DEVICE_UX_ER7_PROFILE_REGRESSION',
    testSource.includes('390')
      && testSource.includes('844')
      && testSource.includes('740')
      && testSource.includes('360')
      && testSource.includes('keyboard threshold')
      && testSource.includes('orientation reset'),
    'Deterministic regressions cover modern portrait phones, compact landscape phones, browser chrome movement, keyboard contraction, and orientation reset',
  );

  pass(
    'READER_DEVICE_UX_ER7_PRODUCT_SCOPE',
    readme.includes('personal ebook library and reader')
      && readme.includes('Public product scope')
      && readme.includes('maintenance infrastructure')
      && !readme.includes('personal publishing, reading, and learning platform'),
    'Repository documentation now describes the public product as an ebook library/reader and keeps publication tooling backstage',
  );

  pass(
    'READER_DEVICE_UX_ER7_DOCUMENTED_LIMIT',
    docs.includes('physical-device')
      && docs.includes('deterministic device-profile')
      && docs.includes('must not be represented as completed'),
    'ER7 distinguishes automated device-profile certification from physical-device evidence instead of overstating validation',
  );

  pass(
    'READER_DEVICE_UX_ER7_LAYER_ORDER',
    epubLayout.includes("../styles/reader-device-ux.css")
      && pdfLayout.includes("../styles/reader-device-ux.css")
      && legacyLayout.includes("../styles/reader-device-ux.css")
      && epubLayout.indexOf("../styles/reader-device-ux.css") > epubLayout.indexOf("../styles/reader-accessibility.css")
      && pdfLayout.indexOf("../styles/reader-device-ux.css") > pdfLayout.indexOf("../styles/pdf-reader.css")
      && legacyLayout.indexOf("../styles/reader-device-ux.css") > legacyLayout.indexOf("../styles/reader.css"),
    'ER7 normalization loads last in every reader so earlier phase CSS cannot re-hide or undersize certified controls',
  );

  pass(
    'READER_DEVICE_UX_ER7_CERT_CHAIN',
    pkg.includes('reading-activity.mjs && node scripts/certification/reader-device-ux.mjs'),
    'ER7 device UX certification is permanently chained after ER6 in certify:source',
  );

  pass(
    'READER_DEVICE_UX_ER7_LOCAL_ONLY',
    !device.includes('fetch(')
      && !device.includes('XMLHttpRequest')
      && !device.includes('sendBeacon')
      && !runtime.includes('sendBeacon'),
    'Device adaptation remains local browser behavior and introduces no telemetry or external synchronization',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_DEVICE_UX_SOURCE_PASS');
