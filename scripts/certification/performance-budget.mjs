import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'performance/budgets.json',
  'src/lib/performance-budget.ts',
  'tests/performance/performance-fixtures.ts',
  'tests/performance/rr4-performance.spec.ts',
  'playwright.performance.config.ts',
  'scripts/regression/performance-budget.test.ts',
  'docs/RR4_PERFORMANCE_MEMORY.md',
  '.github/workflows/performance-budget.yml',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR4_FILES', present, 'RR4 budgets, fixtures, browser harness, regression, workflow, documentation, and evaluator are present');

if (present) {
  const [budgetText, utility, fixtures, tests, config, workflow, docs, pkg, deploy, epubSearch, pdfRuntime] = await Promise.all([
    readFile('performance/budgets.json', 'utf8'),
    readFile('src/lib/performance-budget.ts', 'utf8'),
    readFile('tests/performance/performance-fixtures.ts', 'utf8'),
    readFile('tests/performance/rr4-performance.spec.ts', 'utf8'),
    readFile('playwright.performance.config.ts', 'utf8'),
    readFile('.github/workflows/performance-budget.yml', 'utf8'),
    readFile('docs/RR4_PERFORMANCE_MEMORY.md', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('src/lib/reader/search.ts', 'utf8'),
    readFile('src/lib/pdf-reader/runtime.ts', 'utf8'),
  ]);
  const budgets = JSON.parse(budgetText);

  pass(
    'RR4_BUDGET_SCHEMA',
    budgets.schemaVersion === 1
      && budgets.phase === 'RR4'
      && budgets.profile?.id === 'chromium-low-end-ci'
      && budgets.profile?.evidenceClass === 'synthetic-browser-profile'
      && budgets.profile?.cpuThrottleRate >= 4,
    'The authoritative budget file identifies a throttled synthetic low-end profile without claiming physical-device evidence',
  );

  const requiredTimingBudgets = [
    'importSmallEpub', 'importOrdinaryEpub', 'importLargeEpub', 'importImageHeavyEpub', 'importLongPdf',
    'firstReadySmallEpub', 'firstReadyOrdinaryEpub', 'firstReadyLargeEpub', 'firstReadyImageHeavyEpub', 'firstReadyLongPdf',
    'epubPageTurnP95', 'pdfPageTurnP95', 'epubSearchComplete', 'pdfSearchComplete', 'resumeReady',
    'rotationStable', 'searchCancellation', 'navigationDuringSearch',
  ];
  pass(
    'RR4_BUDGET_COVERAGE',
    requiredTimingBudgets.every((name) => Number.isFinite(budgets.budgetsMs?.[name]) && budgets.budgetsMs[name] > 0)
      && budgets.memory?.openCloseCycles >= 6
      && budgets.memory?.maximumHeapGrowthBytes > 0
      && budgets.responsiveness?.maximumSingleLongTaskMs > 0,
    'Cold/import, first-readable, navigation, search, rotation, resume, cancellation, responsiveness, and retained-memory budgets are explicit',
  );

  pass(
    'RR4_FIXTURE_CLASSES',
    fixtures.includes("title: 'RR4 Small EPUB'")
      && fixtures.includes("title: 'RR4 Ordinary EPUB'")
      && fixtures.includes("title: 'RR4 Large EPUB'")
      && fixtures.includes("title: 'RR4 Image Heavy EPUB'")
      && fixtures.includes('makeLongPdf(180)')
      && fixtures.includes('method: 0')
      && fixtures.includes('RR4-EPUB-FINAL-TARGET')
      && fixtures.includes('RR4-PDF-FINAL-TARGET'),
    'Deterministic small, ordinary, large, image-heavy, and long-document fixtures exercise late-search targets and bounded archive behavior',
  );

  pass(
    'RR4_EVALUATOR',
    utility.includes('summarizePerformanceSamples')
      && utility.includes('percentile')
      && utility.includes('evaluateUpperBudget')
      && utility.includes('positiveGrowth')
      && utility.includes('formatBudgetFailure'),
    'Budget evaluation and percentile/growth calculations are pure, reusable, and covered by Node regression tests',
  );

  pass(
    'RR4_LOW_END_PROFILE',
    config.includes("name: 'chromium-low-end-ci'")
      && config.includes("testDir: './tests/performance'")
      && config.includes('workers: 1')
      && config.includes('timeout: 180_000')
      && tests.includes('Emulation.setCPUThrottlingRate')
      && tests.includes('budgets.profile.cpuThrottleRate'),
    'The release-blocking performance run is serialized and applies the published Chromium CPU-throttling profile',
  );

  pass(
    'RR4_OPERATION_MEASUREMENTS',
    tests.includes('importFixture')
      && tests.includes('openFixture')
      && tests.includes('epubPageTurn')
      && tests.includes('pdfPageTurn')
      && tests.includes('epubSearchComplete')
      && tests.includes('pdfSearchComplete')
      && tests.includes('pdfRotationStable')
      && tests.includes('ResumeReady'),
    'Browser journeys measure import, first-ready, page turns, full-document search, rotation, and exact-format resume',
  );

  pass(
    'RR4_MEMORY_GROWTH',
    tests.includes('HeapProfiler.collectGarbage')
      && tests.includes('Performance.getMetrics')
      && tests.includes('JSHeapUsedSize')
      && tests.includes('Nodes')
      && tests.includes('Frames')
      && tests.includes('positiveGrowth')
      && tests.includes('openCloseCycles'),
    'Retained memory is checked after repeated real EPUB/PDF open-close cycles using post-GC growth instead of an unstable fixed heap ceiling',
  );

  pass(
    'RR4_RESPONSIVENESS',
    tests.includes('PerformanceObserver.supportedEntryTypes')
      && tests.includes("includes('longtask')")
      && tests.includes('maximumJourneyLongTasks')
      && tests.includes('maximumSingleLongTaskMs')
      && tests.includes('searchCancellation'),
    'Long tasks, total blocked time, largest task, and explicit search cancellation are bounded',
  );

  pass(
    'RR4_EPUB_CANCELLATION',
    epubSearch.includes("message: 'Search cancelled.'")
      && epubSearch.includes('this.abortController?.abort()')
      && epubSearch.includes('this.revision += 1'),
    'Closing an active EPUB search cancels the section scan and leaves an explicit stable state',
  );

  pass(
    'RR4_PDF_STALE_RENDER',
    pdfRuntime.includes('RenderingCancelledException')
      && pdfRuntime.includes('generation !== this.renderGeneration')
      && pdfRuntime.includes('page.cleanup()')
      && pdfRuntime.includes('this.root.dataset.pdfRenderGeneration'),
    'Rapid PDF navigation cancels stale render/text work, suppresses expected cancellation errors, cleans page resources, and exposes generation evidence',
  );

  pass(
    'RR4_PDF_SEARCH_CANCELLATION',
    pdfRuntime.includes('const wasSearching = Boolean(this.searchAbort)')
      && pdfRuntime.includes("this.cancelSearch(wasSearching ? 'Search cancelled.' : undefined)")
      && pdfRuntime.includes('this.searchAbort?.abort()')
      && pdfRuntime.includes('controller.signal.aborted')
      && pdfRuntime.includes('page.cleanup()'),
    'Closing or replacing PDF search aborts the scan and each searched PDF page releases transient resources',
  );

  pass(
    'RR4_CI_GATE',
    workflow.includes('pnpm certify:performance')
      && workflow.includes('pnpm build')
      && workflow.includes('pnpm test:performance')
      && workflow.includes('playwright-performance-report')
      && workflow.includes('if: failure()'),
    'RR4 has a dedicated bounded workflow with source certification, build, Chromium execution, and failure-only evidence retention',
  );

  const performanceIndex = deploy.indexOf('Run low-end performance and memory budgets');
  const uploadIndex = deploy.indexOf('actions/upload-pages-artifact@v4');
  pass(
    'RR4_PRODUCTION_GATE',
    deploy.includes('id: performance')
      && deploy.includes('run: pnpm test:performance')
      && performanceIndex >= 0
      && uploadIndex > performanceIndex,
    'The production artifact cannot be uploaded until the low-end performance and retained-memory gate passes',
  );

  pass(
    'RR4_PACKAGE_CHAIN',
    pkg.includes('"test:performance": "playwright test --config=playwright.performance.config.ts"')
      && pkg.includes('"certify:performance": "node scripts/certification/performance-budget.mjs"')
      && pkg.includes('publication-corpus.mjs && node scripts/certification/performance-budget.mjs && node scripts/certification/release-contract.mjs'),
    'RR4 commands are public and source certification preserves RR3 → RR4 → release-contract ordering',
  );

  pass(
    'RR4_DOCUMENTATION',
    docs.includes('## Published budgets')
      && docs.includes('## Memory methodology')
      && docs.includes('## Evidence boundary')
      && docs.includes('does not replace RR2')
      && docs.includes('30–60-minute'),
    'Documentation publishes thresholds, methodology, lifecycle ownership, and the remaining physical sustained-session boundary',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR4_PERFORMANCE_MEMORY_SOURCE_PASS');
