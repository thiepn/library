import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR4_PERFORMANCE_BUDGETS.md',
  'playwright.performance.config.ts',
  'tests/e2e/performance-fixtures.ts',
  'tests/e2e/performance-budget.perf.ts',
  'src/lib/reader/compatibility-harness.ts',
  'src/lib/pdf-reader/runtime.ts',
  '.github/workflows/performance-budget.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR4_FILES', present, 'RR4 budgets, deterministic workloads, EPUB relocation evidence, runtime hardening, controlled browser profile, workflow, production gate, and package ownership are present');

if (present) {
  const [doc, config, fixtures, tests, epubHarness, runtime, workflow, deployment, pkg] = await Promise.all([
    readFile('docs/RR4_PERFORMANCE_BUDGETS.md', 'utf8'),
    readFile('playwright.performance.config.ts', 'utf8'),
    readFile('tests/e2e/performance-fixtures.ts', 'utf8'),
    readFile('tests/e2e/performance-budget.perf.ts', 'utf8'),
    readFile('src/lib/reader/compatibility-harness.ts', 'utf8'),
    readFile('src/lib/pdf-reader/runtime.ts', 'utf8'),
    readFile('.github/workflows/performance-budget.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR4_BUDGETS_DOCUMENTED',
    doc.includes('96 reflowable XHTML spine sections')
      && doc.includes('160 searchable pages')
      && doc.includes('20,000 ms')
      && doc.includes('96 MiB')
      && doc.includes('16,000,000 pixels')
      && doc.includes('8,192 pixels'),
    'RR4 publishes deterministic timing, heap, canvas-area, and canvas-dimension release ceilings');

  pass('RR4_CONTROLLED_PROFILE',
    config.includes("testMatch: '**/performance-budget.perf.ts'")
      && config.includes("browserName: 'chromium'")
      && config.includes("name: 'chromium-performance'")
      && config.includes('workers: 1')
      && !config.includes("browserName: 'firefox'")
      && !config.includes("browserName: 'webkit'"),
    'Timing and heap evidence use one isolated Chromium profile instead of adding noisy performance assertions to the cross-engine correctness matrix');

  pass('RR4_LARGE_FIXTURES',
    fixtures.includes('LARGE_EPUB_CHAPTERS = 96')
      && fixtures.includes('LARGE_PDF_PAGES = 160')
      && fixtures.includes('RR4 FINAL EPUB PERFORMANCE MARKER')
      && fixtures.includes('RR4 FINAL PDF PERFORMANCE MARKER')
      && fixtures.includes('12_000, 18_000')
      && !fixtures.includes('fetch(')
      && !fixtures.includes('XMLHttpRequest')
      && !fixtures.includes('WebSocket'),
    'RR4 workloads are deterministic local 96-section EPUB, 160-page PDF, and oversized-page PDF fixtures with no runtime network dependency; XML namespace URIs are permitted publication metadata');

  pass('RR4_EPUB_RELOCATION_SIGNAL',
    epubHarness.includes('base.controller.subscribe((state) =>')
      && epubHarness.includes('root.dataset.readerLocationCfi = location.cfi')
      && epubHarness.includes('root.dataset.readerLocationIndex = String(location.index)')
      && epubHarness.includes('unsubscribeLocationDiagnostic()')
      && tests.includes("data-reader-location-cfi")
      && tests.includes('beforeCfi')
      && tests.includes(".not.toBe(beforeCfi)"),
    'EPUB navigation timing waits for an exact CFI relocation signal instead of rounded visible percentage text, and diagnostic ownership is removed on teardown');

  pass('RR4_CPU_TIMING',
    tests.includes("'Emulation.setCPUThrottlingRate'")
      && tests.includes('rate = 4')
      && tests.includes('epubImportMs: 20_000')
      && tests.includes('epubNextMs: 3_000')
      && tests.includes('pdfSearchMs: 20_000')
      && tests.includes("test('@rr4 large EPUB")
      && tests.includes("test('@rr4 160-page PDF"),
    'Large EPUB/PDF import, open, exact relocation, navigation, and search budgets execute under a 4x CPU-throttled Chromium profile');

  pass('RR4_HEAP_GATE',
    tests.includes("'HeapProfiler.collectGarbage'")
      && tests.includes("'Runtime.getHeapUsage'")
      && tests.includes('heapGrowthBytes: 96 * MIB')
      && tests.includes('for (let cycle = 0; cycle < 5; cycle += 1)')
      && tests.includes('expect(growth).toBeLessThanOrEqual(BUDGETS.heapGrowthBytes)'),
    'Repeated integrated-reader lifecycle is measured after forced GC and blocks JavaScript heap growth above 96 MiB');

  pass('RR4_PDF_FIT_BOUND',
    runtime.includes('MIN_FIT_SCALE = 0.01')
      && runtime.includes("this.settings.fit === 'custom' ? clampZoom(scale) : clampFitScale(scale)")
      && runtime.includes('Math.max(1, this.elements.viewport.clientWidth - 32)')
      && tests.includes('geometry.cssWidth')
      && tests.includes('geometry.viewportWidth'),
    'Fit modes may scale below manual zoom minimums and oversized pages are asserted to remain inside the available CSS viewport');

  pass('RR4_PDF_RASTER_BOUND',
    runtime.includes('MAX_CANVAS_PIXELS = 16_000_000')
      && runtime.includes('MAX_CANVAS_DIMENSION = 8_192')
      && runtime.includes('MAX_DEVICE_PIXEL_RATIO = 2')
      && runtime.includes('function rasterRatio')
      && runtime.includes('this.root.dataset.pdfRasterPixels')
      && runtime.includes('this.root.dataset.pdfRasterRatio')
      && tests.includes('rasterPixels: 16_000_000')
      && tests.includes('rasterDimension: 8_192'),
    'PDF backing canvases have independent pixel-area, dimension, and device-scale ceilings with browser-visible diagnostic evidence');

  pass('RR4_PDF_STALE_RENDER',
    runtime.includes('private renderGeneration = 0')
      && runtime.includes('const generation = ++this.renderGeneration')
      && runtime.includes('generation !== this.renderGeneration')
      && runtime.includes('isRenderingCancelled(error)')
      && runtime.includes('this.renderTask?.cancel()')
      && runtime.includes('this.textLayer?.cancel()'),
    'Superseded PDF renders are generation-guarded, actively cancelled, and cannot commit stale state after a newer request');

  pass('RR4_PDF_CLEANUP',
    runtime.includes('page.cleanup()')
      && runtime.includes('await document?.cleanup()')
      && runtime.includes('await document?.destroy()')
      && runtime.includes('this.elements.canvas.width = 1')
      && runtime.includes('this.elements.textLayer.replaceChildren()')
      && runtime.includes('private cancelSearch(): boolean')
      && runtime.includes('controller.abort()')
      && runtime.includes('this.cancelSearch()'),
    'Rendered/search pages, PDF documents, search work, canvas allocations, and text layers have explicit release ownership through centralized cancellation',
  );

  pass('RR4_WORKFLOW',
    workflow.includes('name: Performance Budget')
      && workflow.includes('pnpm certify:performance')
      && workflow.includes('playwright install --with-deps chromium')
      && workflow.includes('pnpm build')
      && workflow.includes('pnpm test:performance')
      && workflow.includes('playwright-performance-report'),
    'RR4 has a dedicated source-certified Chromium workflow with failure-only performance evidence');

  const browserIndex = deployment.indexOf('id: browser');
  const performanceIndex = deployment.indexOf('id: performance');
  const pagesIndex = deployment.indexOf('actions/upload-pages-artifact@');
  pass('RR4_PRODUCTION_GATE',
    deployment.includes('Run RR4 performance and memory budgets')
      && deployment.includes('run: pnpm test:performance')
      && deployment.includes("if: failure() && steps.performance.outcome == 'failure'")
      && deployment.includes('production-performance-budget-${{ github.run_id }}')
      && browserIndex >= 0
      && performanceIndex > browserIndex
      && pagesIndex > performanceIndex,
    'Production artifact upload is ordered after both cross-browser acceptance and the RR4 performance/memory gate');

  pass('RR4_PACKAGE_COMMANDS',
    pkg.includes('"test:performance": "playwright test --config=playwright.performance.config.ts"')
      && pkg.includes('"certify:performance": "node scripts/certification/performance-budget.mjs"')
      && pkg.includes('publication-corpus.mjs && node scripts/certification/performance-budget.mjs && node scripts/certification/release-contract.mjs'),
    'RR4 exposes stable commands and permanent source-certification ordering between RR3 corpus and the release contract');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR4_PERFORMANCE_BUDGET_SOURCE_PASS');
