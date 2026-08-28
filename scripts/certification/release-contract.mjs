import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RELEASE_READINESS_ROADMAP.md',
  'docs/RELEASE_SUPPORT_CONTRACT.md',
  'playwright.config.ts',
  'tests/e2e/fixtures.ts',
  'tests/e2e/release-baseline.spec.ts',
  '.github/workflows/browser-acceptance.yml',
  '.github/workflows/deploy.yml',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RELEASE_PHASE1_FILES', present, 'Phase 1 roadmap, support contract, browser configuration, fixtures, journeys, CI workflow, and production deployment gate are present');

if (present) {
  const [roadmap, support, config, fixtures, tests, workflow, deployment, pkg, readme] = await Promise.all([
    readFile('docs/RELEASE_READINESS_ROADMAP.md', 'utf8'),
    readFile('docs/RELEASE_SUPPORT_CONTRACT.md', 'utf8'),
    readFile('playwright.config.ts', 'utf8'),
    readFile('tests/e2e/fixtures.ts', 'utf8'),
    readFile('tests/e2e/release-baseline.spec.ts', 'utf8'),
    readFile('.github/workflows/browser-acceptance.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('README.md', 'utf8'),
  ]);

  pass(
    'RELEASE_PHASE1_ROADMAP',
    Array.from({ length: 9 }, (_, index) => `## Phase ${index + 1} —`).every((heading) => roadmap.includes(heading))
      && roadmap.includes('P0')
      && roadmap.includes('P1')
      && roadmap.includes('Physical-device release candidate')
      && roadmap.includes('Security, privacy, and dependency hardening'),
    'The bounded nine-phase plan covers severity, browser engines, formats, performance, offline/storage, accessibility, UX, portability, security, and physical v1.0 certification',
  );

  pass(
    'RELEASE_PHASE1_SUPPORT_CONTRACT',
    support.includes('## Tier 1 — release-blocking targets')
      && support.includes('## Tier 2 — best-effort compatible targets')
      && support.includes('## Unsupported or explicitly limited')
      && support.includes('## Core acceptance journeys')
      && support.includes('## Evidence language')
      && support.includes('Chromium')
      && support.includes('Firefox')
      && support.includes('WebKit'),
    'Release claims distinguish supported tiers, unsupported content, core journeys, engine evidence, device-profile evidence, and physical-device evidence',
  );

  pass(
    'RELEASE_PHASE1_PLAYWRIGHT_PIN',
    pkg.includes('"@playwright/test": "1.62.1"')
      && pkg.includes('"test:e2e": "playwright test"')
      && pkg.includes('"test:e2e:headed": "playwright test --headed"'),
    'Playwright is pinned and exposed through stable package scripts',
  );

  pass(
    'RELEASE_PHASE1_ENGINE_MATRIX',
    config.includes("name: 'chromium-desktop'")
      && config.includes("name: 'firefox-desktop'")
      && config.includes("name: 'webkit-desktop'")
      && config.includes("name: 'chromium-phone'")
      && config.includes("name: 'webkit-phone'")
      && config.includes("browserName: 'chromium'")
      && config.includes("browserName: 'firefox'")
      && config.includes("browserName: 'webkit'"),
    'The acceptance configuration runs Chromium, Firefox, and WebKit across desktop and phone-sized projects',
  );

  pass(
    'RELEASE_PHASE1_ARTIFACT_POLICY',
    config.includes("trace: 'retain-on-failure'")
      && config.includes("screenshot: 'only-on-failure'")
      && config.includes("video: 'retain-on-failure'")
      && workflow.includes('if: failure()')
      && workflow.includes('playwright-report')
      && workflow.includes('test-results'),
    'Debug artifacts are retained only on failure rather than collected from ordinary personal-library sessions',
  );

  pass(
    'RELEASE_PHASE1_LOCAL_FIXTURES',
    fixtures.includes("name: 'phase-one-test-book.epub'")
      && fixtures.includes("mimeType: 'application/epub+zip'")
      && fixtures.includes("name: 'Phase One PDF Fixture.pdf'")
      && fixtures.includes("mimeType: 'application/pdf'")
      && !fixtures.includes('http://')
      && !fixtures.includes('https://'),
    'EPUB and PDF acceptance fixtures are deterministic local buffers and require no hosted publication media',
  );

  pass(
    'RELEASE_PHASE1_USER_JOURNEYS',
    tests.includes("page.goto('/library')")
      && tests.includes("page.goto('/library/saved')")
      && tests.includes('setInputFiles(fixture)')
      && tests.includes("data-reader-status', 'ready")
      && tests.includes("data-pdf-reader-state', 'ready")
      && tests.includes('expectNoHorizontalOverflow')
      && tests.includes('watchPageErrors'),
    'Browser acceptance exercises catalog navigation, real file import, canonical EPUB/PDF readiness, layout containment, and unhandled-error rejection',
  );

  pass(
    'RELEASE_PHASE1_DIALOG_OWNERSHIP',
    tests.includes('data-pdf-search-toggle')
      && tests.includes('data-pdf-bookmark-toggle')
      && tests.includes("toHaveAttribute('aria-expanded', 'true')")
      && tests.includes("page.keyboard.press('Escape')")
      && tests.includes('toBeFocused()'),
    'PDF dialog opening, Escape dismissal, and focus restoration are verified in browser engines',
  );

  pass(
    'RELEASE_PHASE1_CI',
    workflow.includes('pnpm install --frozen-lockfile')
      && workflow.includes('playwright install --with-deps chromium firefox webkit')
      && workflow.includes('pnpm build')
      && workflow.includes('pnpm test:e2e')
      && workflow.includes('timeout-minutes:'),
    'A permanent bounded Browser Acceptance workflow installs exact dependencies, builds the static app, installs all three engines, and runs the acceptance matrix',
  );

  const mediaIndex = deployment.indexOf('pnpm stage:media');
  const browserIndex = deployment.indexOf('id: browser');
  const pagesIndex = deployment.indexOf('actions/upload-pages-artifact@v4');
  pass(
    'RELEASE_PHASE1_PRODUCTION_GATE',
    deployment.includes('playwright install --with-deps chromium firefox webkit')
      && deployment.includes('Run browser acceptance against the staged production artifact')
      && deployment.includes('run: pnpm test:e2e')
      && deployment.includes("if: failure() && steps.browser.outcome == 'failure'")
      && deployment.includes('production-browser-acceptance-${{ github.run_id }}')
      && deployment.includes('browser acceptance before artifact upload')
      && mediaIndex >= 0
      && browserIndex > mediaIndex
      && pagesIndex > browserIndex,
    'The GitHub Pages artifact cannot be uploaded until the staged production build passes the full browser acceptance matrix, with failure evidence retained',
  );

  pass(
    'RELEASE_PHASE1_README',
    readme.includes('pnpm test:e2e')
      && readme.includes('docs/RELEASE_READINESS_ROADMAP.md')
      && readme.includes('docs/RELEASE_SUPPORT_CONTRACT.md'),
    'Maintainer instructions expose the browser acceptance command, roadmap, and support contract',
  );

  pass(
    'RELEASE_PHASE1_CERT_CHAIN',
    pkg.includes('reader-device-ux.mjs && node scripts/certification/publication-corpus.mjs && node scripts/certification/performance-budget.mjs && node scripts/certification/release-contract.mjs'),
    'Release-contract certification remains after ER7 device-profile, RR3 publication compatibility, and RR4 performance-budget certification',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RELEASE_PHASE1_SOURCE_PASS');
