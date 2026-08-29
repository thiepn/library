import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR6_ACCESSIBILITY_INCLUSIVE_READING.md',
  'src/lib/reader/accessibility.ts',
  'src/lib/reader/engines/epubjs.ts',
  'src/lib/reader/epub-security.ts',
  'src/lib/reader/navigation.ts',
  'src/lib/reader/harness.ts',
  'src/components/reader/ReaderShell.astro',
  'src/components/PdfReaderShell.astro',
  'src/styles/reader-accessibility.css',
  'src/styles/reader-device-ux.css',
  'tests/e2e/accessibility.spec.ts',
  'tests/e2e/reader-tap-zones.spec.ts',
  'tests/e2e/performance-fixtures.ts',
  '.github/workflows/accessibility.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR6_FILES', present, 'RR6 docs, reader/PDF accessibility and EPUB security surfaces, multi-page interaction fixtures, cross-engine tests, workflow, package commands, and production gate are present');

if (present) {
  const [doc, a11y, epub, epubSecurity, navigation, harness, shell, pdfShell, css, deviceCss, tests, tapTests, performanceFixtures, workflow, deployment, pkg] = await Promise.all([
    readFile('docs/RR6_ACCESSIBILITY_INCLUSIVE_READING.md', 'utf8'),
    readFile('src/lib/reader/accessibility.ts', 'utf8'),
    readFile('src/lib/reader/engines/epubjs.ts', 'utf8'),
    readFile('src/lib/reader/epub-security.ts', 'utf8'),
    readFile('src/lib/reader/navigation.ts', 'utf8'),
    readFile('src/lib/reader/harness.ts', 'utf8'),
    readFile('src/components/reader/ReaderShell.astro', 'utf8'),
    readFile('src/components/PdfReaderShell.astro', 'utf8'),
    readFile('src/styles/reader-accessibility.css', 'utf8'),
    readFile('src/styles/reader-device-ux.css', 'utf8'),
    readFile('tests/e2e/accessibility.spec.ts', 'utf8'),
    readFile('tests/e2e/reader-tap-zones.spec.ts', 'utf8'),
    readFile('tests/e2e/performance-fixtures.ts', 'utf8'),
    readFile('.github/workflows/accessibility.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR6_MOBILE_TAP_ZONES',
    navigation.includes('const DEFAULT_EDGE_TAP_RATIO = 1 / 3')
      && navigation.includes('function visibleTapRatio(')
      && navigation.includes('location?.displayedPage')
      && navigation.includes('location?.displayedTotal')
      && navigation.includes('const tapRatio = visibleTapRatio(')
      && navigation.includes("void this.navigate('previous', 'tap')")
      && navigation.includes("void this.navigate('next', 'tap')")
      && navigation.includes('this.shell.toggleControls()')
      && tapTests.includes('short EPUB uses left previous, center chrome, and right next tap zones')
      && tapTests.includes("project.name === 'webkit-phone'")
      && tapTests.includes("page.locator('[data-reader-viewport]')")
      && tapTests.includes('const dispatched = document.dispatchEvent(event)')
      && tapTests.includes('defaultPrevented: event.defaultPrevented')
      && tapTests.includes('EPUB production click listener must consume the compatibility tap')
      && tapTests.includes('page.touchscreen.tap('),
    'Paginated reader uses explicit visible left/center/right thirds, multi-column coordinate normalization, Chromium touchscreen E2E coverage, and WebKit EPUB-Document compatibility-event proof');

  pass('RR6_MULTI_PAGE_READING_CONTINUITY',
    performanceFixtures.includes('export const LARGE_EPUB_CHAPTERS = 96')
      && tapTests.includes('largeEpubFixture')
      && tapTests.includes('multi-page EPUB visible taps preserve reading continuity on desktop and mobile')
      && tapTests.includes('advanceByButton(shell, next, 5)')
      && tapTests.includes('data-reader-location-cfi')
      && tapTests.includes('expect(current).not.toBe(initialCfi)')
      && tapTests.includes('expect(new Set(forwardLocations).size).toBe(forwardLocations.length)')
      && tapTests.includes('expect(await currentCfi(shell)).toBe(deepCfi)'),
    'RR6 includes a 96-section sustained desktop/phone journey that verifies exact-CFI forward/back continuity, repeated center chrome toggles, and no reset to the initial/cover location');

  const readerOpenStart = harness.indexOf('const open = async () => {');
  const readerOpenEnd = harness.indexOf('cleanups.push(readingMode.subscribe', readerOpenStart);
  const readerOpen = readerOpenStart >= 0 && readerOpenEnd > readerOpenStart
    ? harness.slice(readerOpenStart, readerOpenEnd)
    : '';
  const controllerOpenIndex = readerOpen.indexOf('await controller.open(');
  const readingModeIndex = readerOpen.indexOf('await readingMode.start()');
  const typographyIndex = readerOpen.indexOf('await typography.start()');
  const pageLayoutIndex = readerOpen.indexOf('await pageLayout.start()');
  const shellReadyIndex = readerOpen.indexOf("shell.setStatus('ready')");
  const navigationStartIndex = readerOpen.indexOf('navigation.start()');
  pass('RR6_SETTLED_INTERACTION_BOUNDARY',
    controllerOpenIndex >= 0
      && readingModeIndex > controllerOpenIndex
      && typographyIndex > readingModeIndex
      && pageLayoutIndex > typographyIndex
      && shellReadyIndex > pageLayoutIndex
      && navigationStartIndex > shellReadyIndex
      && readerOpen.includes("shell.setStatus('loading', 'Opening book…')")
      && readerOpen.includes('if (navigationStarted) navigation.refresh()')
      && harness.includes('Engine `ready` is intentionally not forwarded to the shell here')
      && navigation.includes("this.shell.root.dataset.readerStatus === 'ready'")
      && navigation.includes('refresh(): void'),
    'Engine ready remains non-interactive while initial flow, typography, page geometry, and progress settle; shell ready is published before navigation is enabled and retries re-sync availability');

  pass('RR6_SECTION_TO_VISIBLE_TAP_GEOMETRY',
    epub.includes('win.innerWidth || doc.documentElement?.clientWidth')
      && epub.includes('win.innerHeight || doc.documentElement?.clientHeight')
      && navigation.includes('function visibleTapRatio(')
      && navigation.includes('const sliceStart = (safePage - 1) / total')
      && navigation.includes('const sliceEnd = (safePage - 1 + visiblePages) / total')
      && tapTests.includes('viewportBox.width * xRatio')
      && tapTests.includes('pageX - iframeBox.x'),
    'Raw EPUB iframe coordinates are normalized from the current section slice into the visible reader viewport before tap-zone classification, and tests target visible outer geometry');

  const visibleInstrumentationCalls = (epub.match(/this\.instrumentVisibleContents\(\);/g) ?? []).length;
  pass('RR6_VISIBLE_CONTENT_INSTRUMENTATION',
    epub.includes('private instrumentVisibleContents(): void')
      && epub.includes('const rendered = rendition.getContents() as unknown')
      && epub.includes('this.handleContent(visible)')
      && epub.includes('await rendition.display(target);\n      this.instrumentVisibleContents();')
      && epub.includes('await rendition.next();\n      this.instrumentVisibleContents();')
      && epub.includes('await rendition.prev();\n      this.instrumentVisibleContents();')
      && visibleInstrumentationCalls >= 3,
    'Visible EPUB Contents are explicitly and idempotently instrumented after display, next, and previous instead of relying only on asynchronous content hooks');

  pass('RR6_RENDERED_VIEW_INSTRUMENTATION',
    epub.includes('interface RenderedView')
      && epub.includes('private readonly handleRendered')
      && epub.includes('if (view?.contents) this.handleContent(view.contents)')
      && epub.includes("rendition.on('rendered', this.handleRendered)")
      && epub.includes("this.rendition.off('rendered', this.handleRendered)"),
    'EPUB.js rendered-view events instrument the exact iframe Contents receiving input, with symmetric teardown');

  pass('RR6_EPUB_SCRIPT_BOUNDARY',
    epub.includes("import { sanitizeEpubDocument } from '../epub-security'")
      && epub.includes('book.spine.hooks.content.register(sanitizeEpubDocument)')
      && epub.includes('allowScriptedContent: true')
      && epub.includes('this.book.spine.hooks.content.deregister(sanitizeEpubDocument)')
      && epubSecurity.includes("const ACTIVE_CONTENT_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'applet'])")
      && epubSecurity.includes("name.startsWith('on')")
      && epubSecurity.includes("value.startsWith('javascript:')")
      && epubSecurity.includes("'Content-Security-Policy'")
      && epubSecurity.includes("\"script-src 'none'\"")
      && epubSecurity.includes("\"object-src 'none'\"")
      && tapTests.includes('expectReaderScriptBoundary')
      && tapTests.includes('EPUB CSP must block publisher-style inline script execution'),
    'WebKit script-capable sandbox is gated by pre-serialization active-content sanitization, restrictive CSP, symmetric hook teardown, and executable browser proof that publisher-style inline scripts remain blocked');

  pass('RR6_TOUCH_POINTER_PARITY',
    epub.includes("doc.addEventListener('pointerdown', handlePointerDown")
      && epub.includes("doc.addEventListener('pointerup', handlePointerUp")
      && epub.includes("doc.addEventListener('touchstart', handleTouchStart")
      && epub.includes("doc.addEventListener('touchend', handleTouchEnd")
      && epub.includes("doc.addEventListener('click', handleClick)")
      && epub.includes('lastHandledInteractionAt')
      && epub.includes('performance.now() - lastHandledInteractionAt < 800')
      && epub.includes('if (pointerStart) return;')
      && epub.includes('deduplicates browsers')
      && epub.includes("pointerType: effectivePointerType"),
    'EPUB interaction accepts Pointer Events, WebKit/Safari Touch Events, and a deduplicated compatibility click tap path');

  pass('RR6_INTERACTION_GUARDS',
    epub.includes('isInteractiveTarget(target)')
      && epub.includes('isInteractiveTarget(event.target) || hasSelection()')
      && epub.includes('const selected = hasSelection()')
      && epub.includes("type: 'swipe'")
      && epub.includes("type: 'tap'")
      && navigation.includes('if (interaction.interactive || interaction.hasSelection) return false'),
    'Interactive publication content and active selection remain outside tap navigation while swipe and tap stay distinct interaction types');

  pass('RR6_EPUB_SEMANTICS',
    a11y.includes("this.shell.viewport.setAttribute('role', 'region')")
      && a11y.includes("frame.title = title ? `Book content: ${title}` : 'Book content'")
      && a11y.includes("getAttribute('xml:lang')")
      && shell.includes('data-reader-announcer')
      && tests.includes('reader semantics, language, keyboard navigation, and focus recovery'),
    'EPUB region, iframe naming/language, live status, keyboard navigation, and focus recovery are executable acceptance requirements');

  pass('RR6_DIALOG_FOCUS',
    a11y.includes('trapReaderDialogFocus')
      && a11y.includes('recoverFocus')
      && a11y.includes("event.key === 'Escape'")
      && tests.includes('appearancePanel')
      && tests.includes('toBeFocused()'),
    'Reader dialogs have deterministic focus entry/containment/close recovery and browser checks');

  pass('RR6_PDF_SEMANTICS',
    pdfShell.includes('aria-label="PDF page"')
      && pdfShell.includes('data-pdf-canvas aria-hidden="true"')
      && pdfShell.includes('data-pdf-text-layer aria-label="Selectable PDF text"')
      && pdfShell.includes('aria-haspopup="dialog"')
      && tests.includes('PDF exposes named controls, selectable text semantics, and deterministic dialog focus'),
    'Integrated PDF reader exposes named controls, hidden visual canvas, selectable text semantics, and dialog focus acceptance');

  pass('RR6_REFLOW_TARGETS',
    css.includes('@media (max-width: 320px)')
      && css.includes('max-width: 100%')
      && css.includes('(hover: none) and (pointer: coarse)')
      && css.includes('min-block-size: 44px')
      && deviceCss.includes('.pdf-reader button:not(.pdf-reader__backdrop)')
      && deviceCss.includes('min-width: 44px')
      && deviceCss.includes('min-height: 44px')
      && tests.includes('400-percent reference reflow')
      && tests.includes('phone reader controls preserve large touch targets')
      && tests.includes('expectMinimumTarget')
      && tests.includes('44'),
    '320 CSS px reflow and >=44x44 CSS px primary EPUB/PDF phone targets are executable release checks');

  pass('RR6_MEDIA_PREFERENCES',
    a11y.includes("safeMatchMedia('(prefers-reduced-motion: reduce)')")
      && a11y.includes("safeMatchMedia('(forced-colors: active)')")
      && css.includes('@media (prefers-reduced-motion: reduce)')
      && css.includes('@media (forced-colors: active)')
      && tests.includes("emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })"),
    'Reduced-motion and forced-colors handling are represented in runtime/CSS and exercised in a browser');

  pass('RR6_WORKFLOW',
    workflow.includes('name: Accessibility Acceptance')
      && workflow.includes('cancel-in-progress: true')
      && workflow.includes('playwright install --with-deps chromium firefox webkit')
      && workflow.includes('pnpm certify:accessibility')
      && workflow.includes('pnpm test:accessibility')
      && workflow.includes('playwright-accessibility-report'),
    'RR6 owns a dedicated source-certified cross-engine workflow with retained failure evidence');

  pass('RR6_PACKAGE_COMMANDS',
    pkg.includes('"test:accessibility": "playwright test tests/e2e/accessibility.spec.ts tests/e2e/reader-tap-zones.spec.ts"')
      && pkg.includes('"certify:accessibility": "node scripts/certification/rr6-accessibility.mjs"')
      && pkg.includes('node scripts/certification/offline-reliability.mjs && node scripts/certification/rr6-accessibility.mjs'),
    'Accessibility acceptance and source certification are stable commands in the permanent source chain');

  const browserIndex = deployment.indexOf('id: browser');
  const performanceIndex = deployment.indexOf('id: performance');
  const offlineIndex = deployment.indexOf('id: offline');
  const accessibilityIndex = deployment.indexOf('id: accessibility');
  const pagesIndex = deployment.indexOf('actions/upload-pages-artifact@v4');
  pass('RR6_PRODUCTION_GATE',
    deployment.includes('Run RR6 accessibility and inclusive-reading acceptance')
      && deployment.includes('run: pnpm test:accessibility')
      && browserIndex >= 0
      && performanceIndex > browserIndex
      && offlineIndex > performanceIndex
      && accessibilityIndex > offlineIndex
      && pagesIndex > accessibilityIndex,
    'Production artifact upload is ordered after Browser Acceptance, RR4, RR5, and RR6 accessibility acceptance');

  pass('RR6_EVIDENCE_BOUNDARY',
    doc.includes('does **not** claim that Playwright is VoiceOver, TalkBack, or NVDA')
      && doc.includes('physical assistive-technology certification')
      && doc.includes('must not claim final physical assistive-technology certification'),
    'RR6 explicitly separates browser automation from physical VoiceOver, TalkBack, and NVDA evidence');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR6_ACCESSIBILITY_SOURCE_PASS');