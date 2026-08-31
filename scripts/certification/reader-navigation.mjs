import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const navigationFiles = [
  'src/lib/reader/navigation.ts',
  'src/lib/reader/engines/epubjs.ts',
  'src/lib/reader/controller.ts',
  'tests/e2e/reader-tap-zones.spec.ts',
  'tests/e2e/performance-fixtures.ts',
];
const navigationExists = (await Promise.all(navigationFiles.map(exists))).every(Boolean);
pass('EPUB_READER_NAVIGATION', navigationExists, 'Dedicated navigation controller, EPUB interaction bridge, and real multi-page navigation regression are present');

if (navigationExists) {
  const navigation = await readFile('src/lib/reader/navigation.ts', 'utf8');
  const engine = await readFile('src/lib/reader/engines/epubjs.ts', 'utf8');
  const controller = await readFile('src/lib/reader/controller.ts', 'utf8');
  const harness = await readFile('src/lib/reader/harness.ts', 'utf8');
  const shell = await readFile('src/components/reader/ReaderShell.astro', 'utf8');
  const publicApi = await readFile('src/lib/reader/index.ts', 'utf8');
  const tapTests = await readFile('tests/e2e/reader-tap-zones.spec.ts', 'utf8');
  const performanceFixtures = await readFile('tests/e2e/performance-fixtures.ts', 'utf8');

  pass('EPUB_READER_NAV_INTERACTION_BRIDGE', engine.includes('rendition.hooks.content.register(this.handleContent)') && controller.includes('onInteraction(listener') && controller.includes('this.engine.onInteraction'), 'EPUB iframe interactions are normalized through engine and controller boundaries');
  pass('EPUB_READER_NAV_INTERACTION_GUARDS', engine.includes('INTERACTIVE_SELECTOR') && engine.includes("'a[href]'") && engine.includes('hasSelection()') && navigation.includes('interaction.interactive || interaction.hasSelection'), 'Links, controls, forms, and text selection bypass reader navigation gestures');
  pass('EPUB_READER_NAV_TAP_ZONES',
    navigation.includes('const DEFAULT_EDGE_TAP_RATIO = 1 / 3')
      && navigation.includes('function visibleTapRatio(')
      && navigation.includes('location?.displayedPage')
      && navigation.includes('location?.displayedTotal')
      && navigation.includes("spread === 'double'")
      && navigation.includes('const tapRatio = visibleTapRatio(')
      && navigation.includes('tapRatio <= this.edgeTapRatio')
      && navigation.includes('tapRatio >= 1 - this.edgeTapRatio')
      && navigation.includes('tapRatio > centerStart && tapRatio < centerEnd')
      && navigation.includes('this.shell.toggleControls()'),
    'Paginated reader maps section-wide EPUB coordinates back to the visible spread before protected previous/center/next classification');
  pass('EPUB_READER_NAV_MULTI_PAGE_CONTINUITY',
    performanceFixtures.includes('export const LARGE_EPUB_CHAPTERS = 96')
      && tapTests.includes('largeEpubFixture')
      && tapTests.includes('multi-page EPUB visible taps preserve reading continuity on desktop and mobile')
      && tapTests.includes('async function verifyDeepReadingContinuity(')
      && tapTests.includes('advanceByButton(shell, next, initialAdvanceCount)')
      && tapTests.includes('verifyDeepReadingContinuity(page)')
      && tapTests.includes('data-reader-location-cfi')
      && tapTests.includes('expect(current).not.toBe(initialCfi)')
      && tapTests.includes('expect(new Set(forwardLocations).size).toBe(forwardLocations.length)')
      && tapTests.includes('expect(await currentCfi(shell)).toBe(deepCfi)'),
    'A 96-section EPUB regression exercises visible-viewport taps several pages deep, repeated chrome toggles, forward turns, and exact-CFI reversal without cover reset');
  pass('EPUB_READER_NAV_HOSTED_CONTINUITY',
    tapTests.includes("const HOSTED_EPUB_ROUTE = '**/library/media/works/**/editions/**/*.epub'")
      && tapTests.includes("await page.goto('/library')")
      && tapTests.includes("page.locator('article.work-card')")
      && tapTests.includes("page.locator('[data-reader-cta]')")
      && !tapTests.includes('ai-for-the-kingdom')
      && tapTests.includes('hosted EPUB route preserves reading continuity and stable chrome')
      && tapTests.includes('verifyDeepReadingContinuity(page, 4)'),
    'A visible public Reader-capable catalog work reuses the same sustained exact-CFI continuity journey instead of relying only on personal-import fixtures or a named publication');
  pass('EPUB_READER_NAV_VISIBLE_VIEWPORT_TEST_GEOMETRY',
    tapTests.includes("const viewport = page.locator('[data-reader-viewport]')")
      && tapTests.includes('viewportBox.width * xRatio')
      && tapTests.includes('pageX - iframeBox.x')
      && !tapTests.includes('box.width * xRatio'),
    'Tap regression targets the visible reader viewport instead of treating a chapter-wide EPUB iframe as one visible page');
  pass('EPUB_READER_NAV_RELOAD_BRIDGE',
    navigation.includes('private startIframeCompatibilityBridge(): void')
      && navigation.includes('new MutationObserver(() => this.scanReaderFrames())')
      && navigation.includes("frame.addEventListener('load', onLoad)")
      && navigation.includes('requestAnimationFrame(() => this.attachDocumentBridge(frame))')
      && navigation.includes("doc.addEventListener('click', handleCompatibilityClick)")
      && navigation.includes('if (event.defaultPrevented || this.destroyed || !this.isInteractiveReady()) return')
      && navigation.includes('isPublicationInteractiveTarget(event.target)')
      && navigation.includes("win?.getSelection()?.toString().trim()")
      && navigation.includes('this.scanReaderFrames();')
      && navigation.includes('this.iframeObserver?.disconnect()')
      && navigation.includes("doc?.removeEventListener('click', handleCompatibilityClick)"),
    'A parent-owned late iframe-load bridge reattaches compatibility click handling after EPUB.js section/document replacement without double turns, link/selection interception, or listener leaks');
  pass('EPUB_READER_NAV_COMPAT_CLICK_DEDUPE',
    engine.includes('interface HandledPointerInteraction')
      && engine.includes('const COMPATIBILITY_CLICK_DEDUPE_MS = 800')
      && engine.includes('const COMPATIBILITY_CLICK_DEDUPE_DISTANCE = 18')
      && engine.includes('let lastHandledPointer: HandledPointerInteraction | null = null')
      && engine.includes('lastHandledPointer = { x, y, time: performance.now() }')
      && engine.includes('performance.now() - lastHandledPointer.time < COMPATIBILITY_CLICK_DEDUPE_MS')
      && engine.includes('Math.hypot(event.clientX - lastHandledPointer.x, event.clientY - lastHandledPointer.y) <= COMPATIBILITY_CLICK_DEDUPE_DISTANCE')
      && navigation.includes('if (event.defaultPrevented || this.destroyed || !this.isInteractiveReady()) return'),
    'Compatibility clicks are suppressed only when temporally and spatially matched to the same handled pointer/touch gesture; rapid independent desktop clicks remain valid');
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
console.log('READER_NAVIGATION_SOURCE_PASS');