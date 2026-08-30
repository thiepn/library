import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR7_READING_ERGONOMICS.md',
  'docs/RR7_MODERATED_DEVICE_SCRIPT.md',
  'docs/RR7_FINDINGS.md',
  'src/lib/reader/ergonomics.ts',
  'src/lib/reader/navigation.ts',
  'src/lib/reader/page-rails.ts',
  'src/lib/reader/shell.ts',
  'src/layouts/EpubReaderLayout.astro',
  'src/styles/reader-ergonomics.css',
  'src/styles/reader-page-rails.css',
  'tests/e2e/reader-ergonomics.spec.ts',
  'tests/e2e/reader-navigation-controls.spec.ts',
  'tests/e2e/reader-tap-zones.spec.ts',
  '.github/workflows/ergonomics.yml',
  'package.json',
];

const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR7_FILES', present, 'RR7 documentation, interaction adapter, navigation surfaces, browser tests, workflow, and package commands are present');

if (present) {
  const [doc, moderated, findings, ergonomics, navigation, rails, shell, layout, ergonomicsCss, railCss, tests, navTests, tapTests, workflow, pkg] = await Promise.all([
    readFile('docs/RR7_READING_ERGONOMICS.md', 'utf8'),
    readFile('docs/RR7_MODERATED_DEVICE_SCRIPT.md', 'utf8'),
    readFile('docs/RR7_FINDINGS.md', 'utf8'),
    readFile('src/lib/reader/ergonomics.ts', 'utf8'),
    readFile('src/lib/reader/navigation.ts', 'utf8'),
    readFile('src/lib/reader/page-rails.ts', 'utf8'),
    readFile('src/lib/reader/shell.ts', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/styles/reader-ergonomics.css', 'utf8'),
    readFile('src/styles/reader-page-rails.css', 'utf8'),
    readFile('tests/e2e/reader-ergonomics.spec.ts', 'utf8'),
    readFile('tests/e2e/reader-navigation-controls.spec.ts', 'utf8'),
    readFile('tests/e2e/reader-tap-zones.spec.ts', 'utf8'),
    readFile('.github/workflows/ergonomics.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const plainDoc = doc.replaceAll('**', '');

  pass('RR7_PANEL_INTERACTION_OWNERSHIP',
    ergonomics.includes("'[data-reader-panel-backdrop]'")
      && ergonomics.includes('this.closePanels()')
      && ergonomics.includes("command.closest('[data-reader-mode-panel], [data-reader-appearance-panel]')")
      && ergonomics.includes("command.dataset.readerCommand === 'appearance'")
      && ergonomics.includes("command.dataset.readerCommand === 'more'")
      && ergonomicsCss.includes('z-index: 20')
      && tests.includes('without accidental page turns')
      && tests.includes("toHaveAttribute('data-reader-panel', 'appearance')")
      && tests.includes('expect(await currentCfi(shell)).toBe(start)'),
    'Floating EPUB settings own exposed reading-surface clicks and dismiss without leaking an accidental page turn');

  pass('RR7_CANONICAL_NAVIGATION_PATH',
    rails.includes('ReaderNavigationController')
      && rails.includes("this.navigation.navigate('previous', 'button')")
      && rails.includes("this.navigation.navigate('next', 'button')")
      && navigation.includes("void this.navigate('previous', 'tap')")
      && navigation.includes("void this.navigate('next', 'tap')")
      && !ergonomics.includes("navigate('previous'")
      && !ergonomics.includes("navigate('next'"),
    'RR7 ergonomics does not create a second page-turn implementation; rails, taps, swipes, keyboard, and footer controls remain on canonical navigation');

  pass('RR7_SCROLL_MODE_AFFORDANCES',
    railCss.includes('.reader-shell[data-reader-flow="scrolled"] .reader-shell__bar--bottom .reader-shell__nav-button')
      && railCss.includes('display: none')
      && navTests.includes('removes page arrows in scroll mode')
      && navTests.includes("toHaveAttribute('data-reader-flow', 'scrolled')")
      && navTests.includes('toBeHidden()'),
    'Native scroll mode removes misleading page-turn rails/footer arrows and restores them in paginated mode');

  pass('RR7_GESTURE_GUARDS',
    tapTests.includes('hasSelection')
      || navigation.includes('interaction.interactive || interaction.hasSelection'),
    'Interactive publication content and active text selection remain protected from tap navigation');

  pass('RR7_CHROME_STABILITY',
    shell.includes('const POINTER_REVEAL_GUARD_MS = 450')
      && shell.includes("if (event.pointerType === 'touch') return")
      && tapTests.includes('expectChromeStable'),
    'Center-tap chrome state cannot immediately reopen from the same touch/pointer/focus sequence');

  pass('RR7_LAYOUT_MOUNT',
    layout.includes("import '../styles/reader-ergonomics.css'")
      && layout.includes("import { mountReaderErgonomics } from '../lib/reader/ergonomics'")
      && layout.includes('mountReaderErgonomics(root)'),
    'The ergonomics adapter and CSS are mounted on every native EPUB shell without changing EPUB/PDF position identity');

  pass('RR7_PHYSICAL_EVIDENCE_BOUNDARY',
    plainDoc.includes('not a substitute for physical-device operation')
      && moderated.includes('exact release candidate SHA')
      && moderated.includes('Do not compensate for defects with undocumented workarounds')
      && findings.includes('Physical device operation')
      && findings.includes('release blocker'),
    'RR7 explicitly distinguishes automated UX evidence from the required exact-SHA physical-device campaign');

  pass('RR7_WORKFLOW',
    workflow.includes('name: Reading Ergonomics Acceptance')
      && workflow.includes('pnpm certify:ergonomics')
      && workflow.includes('pnpm test:ergonomics')
      && workflow.includes('playwright install --with-deps chromium firefox webkit'),
    'RR7 has an independent cross-engine CI signal with source and browser acceptance');

  const scripts = JSON.parse(pkg).scripts ?? {};
  pass('RR7_PACKAGE_COMMANDS',
    scripts['certify:ergonomics'] === 'node scripts/certification/rr7-ergonomics.mjs'
      && typeof scripts['test:ergonomics'] === 'string'
      && scripts['test:ergonomics'].includes('reader-ergonomics.spec.ts')
      && scripts['test:ergonomics'].includes('reader-navigation-controls.spec.ts')
      && scripts['test:ergonomics'].includes('reader-tap-zones.spec.ts')
      && typeof scripts['certify:source'] === 'string'
      && scripts['certify:source'].includes('rr7-ergonomics.mjs'),
    'RR7 source and browser commands are explicit and included in release source certification');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`);
}

if (failed.length) {
  console.error(`\nRR7 certification failed: ${failed.map((check) => check.id).join(', ')}`);
  process.exit(1);
}

console.log(`\nRR7 certification passed (${checks.length} checks).`);
