import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/mobile.ts',
  'src/lib/reader/mobile-harness.ts',
  'src/styles/reader-mobile.css',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_MOBILE_P21', present, 'P21 cohesive mobile reader subsystem is present');

if (present) {
  const [mobile, harness, css, navigation, layout, index, legacyLayout, pkg] = await Promise.all([
    readFile('src/lib/reader/mobile.ts', 'utf8'),
    readFile('src/lib/reader/mobile-harness.ts', 'utf8'),
    readFile('src/styles/reader-mobile.css', 'utf8'),
    readFile('src/lib/reader/navigation.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'EPUB_READER_MOBILE_VISUAL_VIEWPORT',
    mobile.includes('window.visualViewport')
      && mobile.includes("visualViewport?.addEventListener('resize'")
      && mobile.includes("visualViewport?.addEventListener('scroll'")
      && mobile.includes("--reader-visual-height"),
    'Phone geometry follows the visual viewport and publishes viewport dimensions to CSS',
  );
  pass(
    'EPUB_READER_MOBILE_KEYBOARD',
    mobile.includes('keyboardThreshold')
      && mobile.includes('focusedEditable')
      && mobile.includes("data-reader-keyboard")
      && mobile.includes('keepFocusedControlVisible')
      && css.includes('[data-reader-keyboard="open"] .reader-shell__bar--bottom')
      && css.includes('[data-reader-keyboard="open"] .reader-search-panel'),
    'Software-keyboard detection keeps focused controls visible and reclaims obscured reader space',
  );
  pass(
    'EPUB_READER_MOBILE_ORIENTATION',
    mobile.includes("orientation: ReaderMobileOrientation")
      && mobile.includes("window.addEventListener('orientationchange'")
      && mobile.includes('data-reader-orientation')
      && css.includes('@media (max-width: 760px) and (orientation: landscape)')
      && css.includes('[data-reader-compact="true"]'),
    'P21 exposes portrait/landscape and compact-height states for low-height phone layouts',
  );
  pass(
    'EPUB_READER_MOBILE_TOUCH_TARGETS',
    css.includes('min-width: 48px')
      && css.includes('min-height: 48px')
      && css.includes('.reader-toc__row { grid-template-columns: 44px')
      && css.includes('.reader-search-panel__close')
      && css.includes('min-height: 44px'),
    'Primary phone chrome, TOC disclosure, panel close controls, and actions meet mobile touch-target sizing',
  );
  pass(
    'EPUB_READER_MOBILE_IOS_INPUT_ZOOM',
    css.includes('.reader-search-form input')
      && css.includes('.reader-annotation-editor textarea')
      && css.includes('font-size: 16px'),
    'Reader form fields use a 16px phone font floor to avoid focus zoom on iOS',
  );
  pass(
    'EPUB_READER_MOBILE_SAFE_AREAS',
    layout.includes('viewport-fit=cover')
      && css.includes('var(--reader-safe-top)')
      && css.includes('var(--reader-safe-right)')
      && css.includes('var(--reader-safe-bottom)')
      && css.includes('var(--reader-safe-left)'),
    'Mobile chrome and sheets preserve notch/home-indicator safe areas',
  );
  pass(
    'EPUB_READER_MOBILE_SHEETS',
    css.includes('.reader-shell__mode-panel,')
      && css.includes('.reader-search-panel,')
      && css.includes('.reader-bookmarks-panel,')
      && css.includes('.reader-annotations-panel')
      && css.includes('--reader-mobile-sheet-radius')
      && css.includes('overscroll-behavior: contain'),
    'Appearance, mode, search, bookmark, and annotation surfaces use bounded phone sheets with contained overscroll',
  );
  pass(
    'EPUB_READER_MOBILE_SELECTION',
    css.includes('.reader-selection-actions')
      && css.includes('touch-action: manipulation')
      && css.includes('touch-action: pan-y pinch-zoom')
      && css.includes('[data-reader-keyboard="open"] .reader-selection-actions'),
    'Selection actions remain touch-sized while book content preserves vertical pan and pinch-zoom behavior',
  );
  pass(
    'EPUB_READER_MOBILE_DENSE_TOPBAR',
    css.includes('@media (max-width: 420px)')
      && css.includes('grid-template-columns: 44px 0 minmax(0, 1fr)')
      && css.includes('.reader-shell__identity')
      && css.includes('visibility: hidden'),
    'Very narrow phones prioritize all reader actions by collapsing book identity instead of hiding features',
  );
  pass(
    'EPUB_READER_MOBILE_PANEL_NAV_GUARD',
    navigation.includes('[data-reader-search-panel]:not([hidden])')
      && navigation.includes('[data-reader-bookmarks-panel]:not([hidden])')
      && navigation.includes('[data-reader-annotations-panel]:not([hidden])')
      && navigation.includes('[data-reader-selection-actions]:not([hidden])'),
    'Keyboard page-turn shortcuts are blocked while any P18-P20 panel or selection toolbar is open',
  );
  pass(
    'EPUB_READER_MOBILE_HARNESS',
    harness.includes('mountReaderShellWithMobileHarness')
      && harness.includes('mountReaderPublicationWithMobileHarness')
      && harness.includes('mountReaderPublicationWithAnnotationsHarness')
      && harness.includes('ReaderMobileController'),
    'P21 composes on top of the complete P20 staged reader without bypassing annotations/bookmarks/search',
  );
  pass(
    'EPUB_READER_MOBILE_PUBLIC_API',
    index.includes('ReaderMobileController')
      && index.includes('READER_MOBILE_DEFAULTS')
      && index.includes('mountReaderPublicationWithMobileHarness')
      && index.includes('ReaderMobileState'),
    'Mobile state, controller, defaults, and staged harness are exported through the reader API',
  );
  pass(
    'EPUB_READER_MOBILE_LAYER_ORDER',
    layout.includes("../styles/reader-annotations.css")
      && layout.includes("../styles/reader-mobile.css")
      && layout.indexOf("../styles/reader-mobile.css") > layout.indexOf("../styles/reader-annotations.css"),
    'P21 mobile CSS loads after phase-specific reader styles so it can normalize the full reader coherently',
  );
  pass(
    'EPUB_READER_MOBILE_LEGACY_PRESERVED',
    legacyLayout.includes('data-reader-root')
      && !legacyLayout.includes('ReaderMobileController')
      && !legacyLayout.includes('reader-mobile.css'),
    'The existing production Markdown ReaderLayout remains outside the staged P21 EPUB mobile stack',
  );
  pass(
    'EPUB_READER_MOBILE_CERT_CHAIN',
    pkg.includes('reader-annotations.mjs && node scripts/certification/reader-mobile.mjs'),
    'P21 certification is permanently chained after P20 in certify:source',
  );
  pass(
    'EPUB_READER_MOBILE_GENERIC',
    !mobile.includes('ai-for-the-kingdom') && !harness.includes('ai-for-the-kingdom') && !css.includes('ai-for-the-kingdom'),
    'P21 contains no publication-title-specific mobile behavior',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_MOBILE_SOURCE_PASS');
