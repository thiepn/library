import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = ['src/lib/reader/desktop.ts', 'src/lib/reader/desktop-harness.ts', 'src/styles/reader-desktop.css'];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_DESKTOP_P22', present, 'P22 tablet and desktop reader subsystem is present');

if (present) {
  const [desktop, harness, css, readingMode, navigation, layout, index, legacyLayout, pkg] = await Promise.all([
    readFile('src/lib/reader/desktop.ts', 'utf8'),
    readFile('src/lib/reader/desktop-harness.ts', 'utf8'),
    readFile('src/styles/reader-desktop.css', 'utf8'),
    readFile('src/lib/reader/reading-mode.ts', 'utf8'),
    readFile('src/lib/reader/navigation.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('EPUB_READER_DESKTOP_WINDOW_CLASSES', desktop.includes("'phone' | 'tablet' | 'desktop' | 'wide'") && desktop.includes('constrainedWidth'), 'P22 classifies tablet, desktop, wide, and constrained windows');
  pass('EPUB_READER_DESKTOP_RESIZE', desktop.includes('ResizeObserver') && desktop.includes("orientationchange") && desktop.includes('--reader-desktop-width'), 'Reader state follows resize and orientation changes');
  pass('EPUB_READER_DESKTOP_PANEL_AWARE', desktop.includes('MutationObserver') && desktop.includes('data-reader-search-panel') && desktop.includes('data-reader-bookmarks-panel') && desktop.includes('data-reader-annotations-panel'), 'P22 observes actual open reader side panels');
  pass('EPUB_READER_DESKTOP_DOCKING', desktop.includes('dockBreakpoint') && css.includes('[data-reader-dock-side="right"] .reader-shell__stage') && css.includes('[data-reader-dock-side="left"] .reader-shell__stage'), 'Wide screens reserve rendition space for open side panels');
  pass('EPUB_READER_DESKTOP_CFI_REFLOW', readingMode.includes('ResizeObserver') && readingMode.includes('getBoundingClientRect()') && readingMode.includes('preserveLocation: true') && readingMode.includes('width < this.minSpreadWidth'), 'Docking and resize flow through P7 CFI-preserving spread recalculation');
  pass('EPUB_READER_TABLET_LAYOUT', css.includes('@media (min-width: 761px) and (max-width: 1180px)') && css.includes('(orientation: portrait)') && css.includes('[data-reader-desktop-surface="tablet"]'), 'Tablet portrait and landscape layouts have dedicated geometry');
  pass('EPUB_READER_DESKTOP_WIDE', css.includes('@media (min-width: 1560px)') && css.includes('[data-reader-desktop-surface="wide"]'), 'Ultrawide windows use bounded panel geometry');
  pass('EPUB_READER_DESKTOP_COMPACT_HEIGHT', desktop.includes('compactHeight') && css.includes('(max-height: 680px)') && css.includes('[data-reader-window-compact="true"]'), 'Low-height desktop windows reduce chrome density safely');
  pass('EPUB_READER_DESKTOP_POINTER', desktop.includes("matchMedia('(hover: hover)')") && desktop.includes("matchMedia('(pointer: fine)')") && css.includes('@media (hover: hover) and (pointer: fine)'), 'Fine-pointer environments receive desktop hover affordances');
  pass('EPUB_READER_DESKTOP_TRACKPAD_SAFE', !navigation.includes("interaction.type === 'wheel'") && navigation.includes("if (interaction.type === 'swipe')"), 'Wheel and trackpad scrolling remain native instead of becoming page-turn commands');
  pass('EPUB_READER_DESKTOP_HARNESS', harness.includes('mountReaderPublicationWithDesktopHarness') && harness.includes('mountReaderPublicationWithMobileHarness') && harness.includes('ReaderDesktopController'), 'P22 composes on top of the complete P21 staged reader');
  pass('EPUB_READER_DESKTOP_PUBLIC_API', index.includes('ReaderDesktopController') && index.includes('READER_DESKTOP_DEFAULTS') && index.includes('ReaderDesktopState'), 'P22 APIs are exported');
  pass('EPUB_READER_DESKTOP_LAYER_ORDER', layout.includes("../styles/reader-mobile.css") && layout.includes("../styles/reader-desktop.css") && layout.indexOf('reader-desktop.css') > layout.indexOf('reader-mobile.css'), 'Desktop optimization CSS loads after mobile normalization');
  pass('EPUB_READER_DESKTOP_LEGACY_PRESERVED', legacyLayout.includes("import '../styles/reader.css';") && !legacyLayout.includes('ReaderDesktopController') && !legacyLayout.includes('reader-desktop.css'), 'Legacy production reader remains outside the staged P22 stack');
  pass('EPUB_READER_DESKTOP_CERT_CHAIN', pkg.includes('reader-mobile.mjs && node scripts/certification/reader-desktop.mjs'), 'P22 certification is chained after P21');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_DESKTOP_SOURCE_PASS');
