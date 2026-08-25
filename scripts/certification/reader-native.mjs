import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const tocFiles = [
  'src/lib/reader/toc.ts',
  'src/lib/reader/toc-harness.ts',
  'src/styles/reader-toc.css',
];
const tocExists = (await Promise.all(tocFiles.map(exists))).every(Boolean);
pass('EPUB_READER_NATIVE_TOC', tocExists, 'Native EPUB TOC controller, harness, and responsive styles are present');

if (tocExists) {
  const toc = await readFile('src/lib/reader/toc.ts', 'utf8');
  const tocHarness = await readFile('src/lib/reader/toc-harness.ts', 'utf8');
  const tocCss = await readFile('src/styles/reader-toc.css', 'utf8');
  const engine = await readFile('src/lib/reader/engines/epubjs.ts', 'utf8');

  pass('EPUB_READER_TOC_NATIVE_NAV', engine.includes('loaded.navigation') && engine.includes('mapToc(navigation.toc)') && engine.includes('children: mapToc'), 'TOC data comes from the EPUB navigation tree and preserves nesting');
  pass('EPUB_READER_TOC_NESTED_RENDER', toc.includes('renderLevel(item.children') && toc.includes('data-reader-toc-disclosure') && toc.includes('aria-expanded'), 'Nested EPUB Parts/chapters render recursively with expandable branches');
  pass('EPUB_READER_TOC_HREF_NAVIGATION', toc.includes('this.controller.goTo(href)') && !toc.includes('window.location'), 'TOC targets navigate through ReaderController without browser page navigation');
  pass('EPUB_READER_TOC_ACTIVE_LOCATION', toc.includes("aria-current', 'location") && toc.includes('normalizeDocumentHref') && toc.includes('expandBranch(active.parentKeys)'), 'Relocation highlights the active EPUB section and expands its ancestor branch');
  pass('EPUB_READER_TOC_LONG_BOOK_SAFE', toc.includes('tocSignature') && toc.includes('nextSignature !== this.signature') && toc.includes('becameReady'), 'TOC DOM is not rebuilt on ordinary page relocation');
  pass('EPUB_READER_TOC_ACCESSIBLE_DRAWER', toc.includes("role', 'dialog") && toc.includes("aria-modal', 'true") && toc.includes("event.key === 'Tab'") && toc.includes("event.key === 'Escape'"), 'Contents drawer has modal semantics, focus containment, and Escape dismissal');
  pass('EPUB_READER_TOC_MOBILE', tocCss.includes('@media (max-width: 600px)') && tocCss.includes('@media (max-width: 370px)') && tocCss.includes('min-height: 44px'), 'TOC remains reachable and touch-usable on narrow mobile screens');
  pass('EPUB_READER_TOC_HARNESS', tocHarness.includes('mountReaderPublicationWithTocHarness') && tocHarness.includes('ReaderTocController') && tocHarness.includes('toc.start()'), 'Publication-aware harness composes native TOC with the EPUB reader stack');
}

const navigationFiles = [
  'src/lib/reader/navigation.ts',
  'src/lib/reader/engines/epubjs.ts',
  'src/lib/reader/controller.ts',
];
const navigationExists = (await Promise.all(navigationFiles.map(exists))).every(Boolean);
pass('EPUB_READER_NAVIGATION', navigationExists, 'Dedicated P14 navigation controller and EPUB interaction bridge are present');

if (navigationExists) {
  const navigation = await readFile('src/lib/reader/navigation.ts', 'utf8');
  const engine = await readFile('src/lib/reader/engines/epubjs.ts', 'utf8');
  const controller = await readFile('src/lib/reader/controller.ts', 'utf8');
  const harness = await readFile('src/lib/reader/harness.ts', 'utf8');
  const shell = await readFile('src/components/reader/ReaderShell.astro', 'utf8');
  const publicApi = await readFile('src/lib/reader/index.ts', 'utf8');

  pass('EPUB_READER_NAV_INTERACTION_BRIDGE', engine.includes('rendition.hooks.content.register(this.handleContent)') && controller.includes('onInteraction(listener') && controller.includes('this.engine.onInteraction'), 'EPUB iframe interactions are normalized through engine and controller boundaries');
  pass('EPUB_READER_NAV_INTERACTION_GUARDS', engine.includes('INTERACTIVE_SELECTOR') && engine.includes("'a[href]'") && engine.includes('hasSelection()') && navigation.includes('interaction.interactive || interaction.hasSelection'), 'Links, controls, forms, and text selection bypass reader navigation gestures');
  pass('EPUB_READER_NAV_TAP_ZONES', navigation.includes('edgeTapRatio') && navigation.includes("interaction.xRatio <= this.edgeTapRatio") && navigation.includes("interaction.xRatio >= 1 - this.edgeTapRatio") && navigation.includes('this.shell.toggleControls()'), 'Paginated reader has protected previous/center/next tap zones');
  pass('EPUB_READER_NAV_SWIPE', engine.includes("type: 'swipe'") && engine.includes('absX >= 48') && navigation.includes("interaction.direction === 'left' ? 'next' : 'previous'"), 'Horizontal touch/pen swipes produce page turns only after gesture qualification');
  pass('EPUB_READER_NAV_KEYBOARD', ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Space'].every((key) => navigation.includes(key)) && navigation.includes("source === 'keyboard'"), 'Paginated reader supports standard page-turn keyboard controls');
  pass('EPUB_READER_NAV_SCROLL_SAFE', navigation.includes("this.readingModeState.flow !== 'paginated'") && navigation.includes("this.readingModeState.flow === 'paginated'"), 'Scroll mode does not hijack page keys, edge taps, or swipe page turns');
  pass('EPUB_READER_NAV_SERIALIZED', navigation.includes('this.state.busy') && navigation.includes('this.setBusy(true)') && navigation.includes('this.setBusy(false)'), 'Navigation commands cannot overlap while a page turn is in flight');
  pass('EPUB_READER_NAV_BOUNDARIES', navigation.includes('location?.atStart') && navigation.includes('location?.atEnd') && navigation.includes("announce('Beginning of book')") && navigation.includes("announce('End of book')"), 'Beginning/end boundaries disable movement and provide accessible feedback');
  pass('EPUB_READER_NAV_SINGLE_OWNER', harness.includes('new ReaderNavigationController') && harness.includes('navigation.start()') && !harness.includes("command === 'previous') await controller.previous") && !harness.includes("command === 'next') await controller.next"), 'Previous/next controls have one navigation owner rather than competing handlers');
  pass('EPUB_READER_NAV_A11Y', shell.includes('aria-label="Previous page"') && shell.includes('aria-label="Next page"') && navigation.includes('setNavigationAvailability') && navigation.includes('shell.announce'), 'Page controls expose labels, disabled boundary state, and live navigation announcements');
  pass('EPUB_READER_NAV_NO_HISTORY', !/(pushState|replaceState|history\.)/.test(`${navigation}\n${harness}\n${engine}`), 'Page turns do not create or replace browser-history entries');
  pass('EPUB_READER_NAV_PUBLIC_API', publicApi.includes('ReaderNavigationController') && publicApi.includes('ReaderContentInteraction') && publicApi.includes('ReaderNavigationState'), 'Navigation controller and normalized interaction types are part of the stable reader module surface');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('NATIVE_READER_SOURCE_PASS');
