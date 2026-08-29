import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR6_ACCESSIBILITY_INCLUSIVE_READING.md',
  'src/lib/reader/accessibility.ts',
  'src/lib/reader/engines/epubjs.ts',
  'src/lib/reader/navigation.ts',
  'src/components/reader/ReaderShell.astro',
  'src/components/PdfReaderShell.astro',
  'src/styles/reader-accessibility.css',
  'tests/e2e/accessibility.spec.ts',
  'tests/e2e/reader-tap-zones.spec.ts',
  '.github/workflows/accessibility.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR6_FILES', present, 'RR6 docs, reader/PDF accessibility surfaces, cross-engine tests, workflow, package commands, and production gate are present');

if (present) {
  const [doc, a11y, epub, navigation, shell, pdfShell, css, tests, tapTests, workflow, deployment, pkg] = await Promise.all([
    readFile('docs/RR6_ACCESSIBILITY_INCLUSIVE_READING.md', 'utf8'),
    readFile('src/lib/reader/accessibility.ts', 'utf8'),
    readFile('src/lib/reader/engines/epubjs.ts', 'utf8'),
    readFile('src/lib/reader/navigation.ts', 'utf8'),
    readFile('src/components/reader/ReaderShell.astro', 'utf8'),
    readFile('src/components/PdfReaderShell.astro', 'utf8'),
    readFile('src/styles/reader-accessibility.css', 'utf8'),
    readFile('tests/e2e/accessibility.spec.ts', 'utf8'),
    readFile('tests/e2e/reader-tap-zones.spec.ts', 'utf8'),
    readFile('.github/workflows/accessibility.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR6_MOBILE_TAP_ZONES',
    navigation.includes('const DEFAULT_EDGE_TAP_RATIO = 1 / 3')
      && navigation.includes("void this.navigate('previous', 'tap')")
      && navigation.includes("void this.navigate('next', 'tap')")
      && navigation.includes('this.shell.toggleControls()')
      && tapTests.includes('left previous, center chrome, and right next tap zones'),
    'Paginated reader uses explicit left/center/right thirds and browser regression coverage');

  pass('RR6_VIEWPORT_RELATIVE_POINTERS',
    epub.includes('win.innerWidth || doc.documentElement?.clientWidth')
      && epub.includes('win.innerHeight || doc.documentElement?.clientHeight')
      && epub.includes('PointerEvent client coordinates are relative to the visible iframe viewport')
      && !epub.includes('doc.documentElement?.clientWidth || win.innerWidth'),
    'EPUB tap coordinates normalize against the visible iframe viewport rather than a paginated document width');

  pass('RR6_INTERACTION_GUARDS',
    epub.includes('isInteractiveTarget(event.target)')
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
      && tests.includes('400-percent reference reflow')
      && tests.includes('phone reader controls preserve large touch targets')
      && tests.includes('expectMinimumTarget')
      && tests.includes('44'),
    '320 CSS px reflow and >=44 CSS px primary phone targets are executable release checks');

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
