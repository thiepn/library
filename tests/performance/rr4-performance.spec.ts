import { readFileSync } from 'node:fs';
import { expect, test, type CDPSession, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  evaluateUpperBudget,
  formatBudgetFailure,
  positiveGrowth,
  summarizePerformanceSamples,
  type PerformanceBudgetResult,
} from '../../src/lib/performance-budget';
import type { BrowserFixtureFile } from '../e2e/fixtures';
import {
  RR4_FINAL_EPUB_TOKEN,
  RR4_FINAL_PDF_TOKEN,
  imageHeavyEpubFixture,
  largeEpubFixture,
  longPdfFixture,
  ordinaryEpubFixture,
  performanceFixtureMetadata,
  smallEpubFixture,
} from './performance-fixtures';

interface BudgetManifest {
  profile: { cpuThrottleRate: number };
  fixtures: {
    smallEpub: { maximumBytes: number; minimumSpineItems: number };
    ordinaryEpub: { maximumBytes: number; minimumSpineItems: number };
    largeEpub: { maximumBytes: number; minimumSpineItems: number };
    imageHeavyEpub: { maximumBytes: number; minimumImageResources: number };
    longPdf: { maximumBytes: number; minimumPages: number };
  };
  budgetsMs: Record<string, number>;
  responsiveness: {
    maximumJourneyLongTasks: number;
    maximumJourneyLongTaskTotalMs: number;
    maximumSingleLongTaskMs: number;
  };
  memory: {
    openCloseCycles: number;
    maximumHeapGrowthBytes: number;
    maximumDomNodeGrowth: number;
    maximumFrameGrowth: number;
    garbageCollectionSamples: number;
  };
}

interface RuntimeMemory {
  heapBytes: number;
  nodes: number;
  frames: number;
}

const budgets = JSON.parse(readFileSync(new URL('../../performance/budgets.json', import.meta.url), 'utf8')) as BudgetManifest;
const budgetResults: PerformanceBudgetResult[] = [];

function budget(metric: string, observed: number, limit: number, unit: PerformanceBudgetResult['unit'] = 'ms'): void {
  const result = evaluateUpperBudget(metric, observed, limit, unit);
  budgetResults.push(result);
  expect(result.passed, formatBudgetFailure(result)).toBe(true);
}

async function attachMetrics(testInfo: TestInfo, metrics: Record<string, unknown>): Promise<void> {
  await testInfo.attach('rr4-performance-metrics.json', {
    body: Buffer.from(JSON.stringify({ metrics, budgetResults }, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as Window & { __rr4LongTasks?: number[] };
    target.__rr4LongTasks = [];
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) target.__rr4LongTasks?.push(entry.duration);
        });
        observer.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      // Unsupported observers produce an empty local evidence set rather than failing reading.
    }
  });
}

async function longTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => [...((window as Window & { __rr4LongTasks?: number[] }).__rr4LongTasks ?? [])]);
}

async function createLowEndSession(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: budgets.profile.cpuThrottleRate });
  await session.send('Performance.enable');
  await session.send('HeapProfiler.enable');
  return session;
}

async function browserNow(page: Page): Promise<number> {
  return page.evaluate(() => performance.now());
}

async function measureMs(page: Page, action: () => Promise<void>): Promise<number> {
  const started = await browserNow(page);
  await action();
  return (await browserNow(page)) - started;
}

function titleCard(page: Page, title: string): Locator {
  return page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
}

async function importFixture(page: Page, fixture: BrowserFixtureFile, title: string): Promise<number> {
  await page.goto('/library/saved');
  const status = page.locator('[data-personal-import-status]');
  const elapsed = await measureMs(page, async () => {
    await page.locator('[data-personal-file-input]').setInputFiles(fixture);
    await expect(status).toContainText('1 imported');
    await expect(titleCard(page, title)).toHaveCount(1);
  });
  return elapsed;
}

async function openFixture(page: Page, title: string, format: 'epub' | 'pdf'): Promise<number> {
  const card = titleCard(page, title);
  await expect(card).toHaveCount(1);
  return measureMs(page, async () => {
    await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
    if (format === 'epub') {
      await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready');
    } else {
      await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready');
    }
  });
}

async function goToSaved(page: Page): Promise<void> {
  await page.goto('/library/saved');
  await expect(page.locator('[data-personal-file-input]')).toBeAttached();
}

async function readerLocationCfi(page: Page): Promise<string> {
  return page.locator('[data-reader-shell]').getAttribute('data-reader-location-cfi').then((value) => value ?? '');
}

async function epubPageTurn(page: Page): Promise<number> {
  const next = page.locator('[data-reader-command="next"]');
  await expect(next).toBeEnabled();
  const before = await readerLocationCfi(page);
  expect(before).not.toBe('');
  return measureMs(page, async () => {
    await next.click();
    await expect.poll(() => readerLocationCfi(page)).not.toBe(before);
  });
}

async function pdfPageTurn(page: Page): Promise<number> {
  const input = page.locator('[data-pdf-page-input]');
  const before = Number(await input.inputValue());
  return measureMs(page, async () => {
    await page.locator('[data-pdf-next]').click();
    await expect(input).toHaveValue(String(before + 1));
  });
}

async function memorySample(session: CDPSession): Promise<RuntimeMemory> {
  const response = await session.send('Performance.getMetrics');
  const value = (name: string): number => response.metrics.find((metric) => metric.name === name)?.value ?? 0;
  return { heapBytes: value('JSHeapUsedSize'), nodes: value('Nodes'), frames: value('Frames') };
}

async function collectStableMemory(session: CDPSession): Promise<RuntimeMemory> {
  const samples: RuntimeMemory[] = [];
  for (let index = 0; index < budgets.memory.garbageCollectionSamples; index += 1) {
    await session.send('HeapProfiler.collectGarbage');
    await new Promise((resolve) => setTimeout(resolve, 100));
    samples.push(await memorySample(session));
  }
  const median = (values: number[]) => summarizePerformanceSamples(values).p50;
  return {
    heapBytes: median(samples.map((sample) => sample.heapBytes)),
    nodes: median(samples.map((sample) => sample.nodes)),
    frames: median(samples.map((sample) => sample.frames)),
  };
}

function checkLongTasks(values: number[], prefix: string): void {
  const summary = summarizePerformanceSamples(values);
  budget(`${prefix}.longTaskCount`, values.length, budgets.responsiveness.maximumJourneyLongTasks, 'count');
  budget(`${prefix}.longTaskTotal`, values.reduce((sum, value) => sum + value, 0), budgets.responsiveness.maximumJourneyLongTaskTotalMs);
  budget(`${prefix}.longestTask`, summary.maximum, budgets.responsiveness.maximumSingleLongTaskMs);
}

test.beforeEach(async ({ page }) => {
  budgetResults.length = 0;
  await installLongTaskObserver(page);
});

test('RR4 fixture classes remain deterministic and bounded', async ({}, testInfo) => {
  expect(performanceFixtureMetadata.smallEpub.bytes).toBeLessThanOrEqual(budgets.fixtures.smallEpub.maximumBytes);
  expect(performanceFixtureMetadata.smallEpub.spineItems).toBeGreaterThanOrEqual(budgets.fixtures.smallEpub.minimumSpineItems);
  expect(performanceFixtureMetadata.ordinaryEpub.bytes).toBeLessThanOrEqual(budgets.fixtures.ordinaryEpub.maximumBytes);
  expect(performanceFixtureMetadata.ordinaryEpub.spineItems).toBeGreaterThanOrEqual(budgets.fixtures.ordinaryEpub.minimumSpineItems);
  expect(performanceFixtureMetadata.largeEpub.bytes).toBeLessThanOrEqual(budgets.fixtures.largeEpub.maximumBytes);
  expect(performanceFixtureMetadata.largeEpub.spineItems).toBeGreaterThanOrEqual(budgets.fixtures.largeEpub.minimumSpineItems);
  expect(performanceFixtureMetadata.imageHeavyEpub.bytes).toBeLessThanOrEqual(budgets.fixtures.imageHeavyEpub.maximumBytes);
  expect(performanceFixtureMetadata.imageHeavyEpub.images).toBeGreaterThanOrEqual(budgets.fixtures.imageHeavyEpub.minimumImageResources);
  expect(performanceFixtureMetadata.longPdf.bytes).toBeLessThanOrEqual(budgets.fixtures.longPdf.maximumBytes);
  expect(performanceFixtureMetadata.longPdf.pages).toBeGreaterThanOrEqual(budgets.fixtures.longPdf.minimumPages);
  await attachMetrics(testInfo, performanceFixtureMetadata);
});

test('small and ordinary EPUB import/open budgets pass on the low-end profile', async ({ page }, testInfo) => {
  const session = await createLowEndSession(page);
  const metrics: Record<string, number> = {};

  metrics.importSmallEpub = await importFixture(page, smallEpubFixture, 'RR4 Small EPUB');
  budget('importSmallEpub', metrics.importSmallEpub, budgets.budgetsMs.importSmallEpub!);
  metrics.firstReadySmallEpub = await openFixture(page, 'RR4 Small EPUB', 'epub');
  budget('firstReadySmallEpub', metrics.firstReadySmallEpub, budgets.budgetsMs.firstReadySmallEpub!);

  await goToSaved(page);
  metrics.importOrdinaryEpub = await importFixture(page, ordinaryEpubFixture, 'RR4 Ordinary EPUB');
  budget('importOrdinaryEpub', metrics.importOrdinaryEpub, budgets.budgetsMs.importOrdinaryEpub!);
  metrics.firstReadyOrdinaryEpub = await openFixture(page, 'RR4 Ordinary EPUB', 'epub');
  budget('firstReadyOrdinaryEpub', metrics.firstReadyOrdinaryEpub, budgets.budgetsMs.firstReadyOrdinaryEpub!);
  checkLongTasks(await longTasks(page), 'ordinaryEpub');

  await session.detach();
  await attachMetrics(testInfo, metrics);
});

test('large, image-heavy, and long-PDF import/open budgets pass', async ({ page }, testInfo) => {
  const session = await createLowEndSession(page);
  const metrics: Record<string, number> = {};
  const cases = [
    { fixture: largeEpubFixture, title: 'RR4 Large EPUB', format: 'epub' as const, importBudget: 'importLargeEpub', openBudget: 'firstReadyLargeEpub' },
    { fixture: imageHeavyEpubFixture, title: 'RR4 Image Heavy EPUB', format: 'epub' as const, importBudget: 'importImageHeavyEpub', openBudget: 'firstReadyImageHeavyEpub' },
    { fixture: longPdfFixture, title: 'rr4 long 180 page', format: 'pdf' as const, importBudget: 'importLongPdf', openBudget: 'firstReadyLongPdf' },
  ];

  for (const item of cases) {
    await goToSaved(page);
    const importElapsed = await importFixture(page, item.fixture, item.title);
    metrics[item.importBudget] = importElapsed;
    budget(item.importBudget, importElapsed, budgets.budgetsMs[item.importBudget]!);
    const openElapsed = await openFixture(page, item.title, item.format);
    metrics[item.openBudget] = openElapsed;
    budget(item.openBudget, openElapsed, budgets.budgetsMs[item.openBudget]!);
  }
  checkLongTasks(await longTasks(page), 'longPdfOpen');

  await session.detach();
  await attachMetrics(testInfo, metrics);
});

test('large EPUB remains responsive for page turns, search, cancellation, and resume', async ({ page }, testInfo) => {
  const session = await createLowEndSession(page);
  const metrics: Record<string, number | number[]> = {};
  await importFixture(page, largeEpubFixture, 'RR4 Large EPUB');
  await openFixture(page, 'RR4 Large EPUB', 'epub');

  const turns: number[] = [];
  for (let index = 0; index < 8; index += 1) turns.push(await epubPageTurn(page));
  const turnSummary = summarizePerformanceSamples(turns);
  metrics.epubPageTurns = turns;
  budget('epubPageTurnP95', turnSummary.p95, budgets.budgetsMs.epubPageTurnP95!);

  await page.locator('[data-reader-search-toggle]').click();
  const searchStatus = page.locator('[data-reader-search-status]');
  await page.locator('[data-reader-search-input]').fill(RR4_FINAL_EPUB_TOKEN);
  const searchStarted = await browserNow(page);
  await page.locator('[data-reader-search-form]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(searchStatus).toContainText(/(?:Searching \d+ of \d+ sections|1 match)/i);
  metrics.epubSearchFirstProgress = (await browserNow(page)) - searchStarted;
  budget('epubSearchFirstProgress', metrics.epubSearchFirstProgress as number, budgets.budgetsMs.epubSearchFirstProgress!);
  await expect(searchStatus).toContainText(/1 match/i);
  metrics.epubSearchComplete = (await browserNow(page)) - searchStarted;
  budget('epubSearchComplete', metrics.epubSearchComplete as number, budgets.budgetsMs.epubSearchComplete!);

  await page.locator('[data-reader-search-input]').fill('RR4-ABSENT-CANCELLATION-TOKEN');
  await page.locator('[data-reader-search-form]').evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(searchStatus).toContainText(/Searching/i);
  metrics.epubSearchCancellation = await measureMs(page, async () => {
    await page.locator('[data-reader-search-close]').click();
    await expect(page.locator('[data-reader-search-panel]')).toBeHidden();
    await expect(searchStatus).toContainText(/cancelled/i);
  });
  budget('epubSearchCancellation', metrics.epubSearchCancellation as number, budgets.budgetsMs.searchCancellation!);
  metrics.epubNavigationAfterCancellation = await epubPageTurn(page);
  budget(
    'epubNavigationAfterCancellation',
    metrics.epubNavigationAfterCancellation as number,
    budgets.budgetsMs.navigationDuringSearch!,
  );

  const savedCfi = await readerLocationCfi(page);
  expect(savedCfi).not.toBe('');
  await goToSaved(page);
  metrics.epubResumeReady = await openFixture(page, 'RR4 Large EPUB', 'epub');
  budget('epubResumeReady', metrics.epubResumeReady as number, budgets.budgetsMs.resumeReady!);
  await expect.poll(() => readerLocationCfi(page)).toBe(savedCfi);
  checkLongTasks(await longTasks(page), 'largeEpubJourney');

  await session.detach();
  await attachMetrics(testInfo, metrics);
});

test('long PDF remains responsive for navigation, search, rotation, cancellation, and resume', async ({ page }, testInfo) => {
  const session = await createLowEndSession(page);
  const metrics: Record<string, number | number[]> = {};
  await importFixture(page, longPdfFixture, 'rr4 long 180 page');
  await openFixture(page, 'rr4 long 180 page', 'pdf');

  const turns: number[] = [];
  for (let index = 0; index < 8; index += 1) turns.push(await pdfPageTurn(page));
  metrics.pdfPageTurns = turns;
  budget('pdfPageTurnP95', summarizePerformanceSamples(turns).p95, budgets.budgetsMs.pdfPageTurnP95!);

  await page.locator('[data-pdf-search-toggle]').click();
  const searchStatus = page.locator('[data-pdf-search-status]');
  await page.locator('[data-pdf-search-input]').fill(RR4_FINAL_PDF_TOKEN);
  const searchStarted = await browserNow(page);
  await page.locator('[data-pdf-search-submit]').click();
  await expect(searchStatus).toContainText(/(?:Searching… \d+ \/ 180|1 matching page)/i);
  metrics.pdfSearchFirstProgress = (await browserNow(page)) - searchStarted;
  budget('pdfSearchFirstProgress', metrics.pdfSearchFirstProgress as number, budgets.budgetsMs.pdfSearchFirstProgress!);
  await expect(searchStatus).toContainText(/1 matching page/i);
  metrics.pdfSearchComplete = (await browserNow(page)) - searchStarted;
  budget('pdfSearchComplete', metrics.pdfSearchComplete as number, budgets.budgetsMs.pdfSearchComplete!);

  await page.locator('[data-pdf-search-input]').fill('RR4-ABSENT-CANCELLATION-TOKEN');
  await page.locator('[data-pdf-search-submit]').click();
  await expect(searchStatus).toContainText(/Searching/i);
  metrics.pdfSearchCancellation = await measureMs(page, async () => {
    await page.locator('[data-pdf-search-close]').click();
    await expect(page.locator('[data-pdf-search-panel]')).toBeHidden();
    await expect(searchStatus).toContainText(/cancelled/i);
  });
  budget('pdfSearchCancellation', metrics.pdfSearchCancellation as number, budgets.budgetsMs.searchCancellation!);
  metrics.pdfNavigationAfterCancellation = await pdfPageTurn(page);
  budget(
    'pdfNavigationAfterCancellation',
    metrics.pdfNavigationAfterCancellation as number,
    budgets.budgetsMs.navigationDuringSearch!,
  );

  metrics.pdfRotationStable = await measureMs(page, async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-orientation', 'landscape');
    await expect(page.locator('[data-pdf-status]')).toContainText(/Page \d+ of 180/);
  });
  budget('pdfRotationStable', metrics.pdfRotationStable as number, budgets.budgetsMs.rotationStable!);

  await page.locator('[data-pdf-page-input]').fill('40');
  await page.locator('[data-pdf-page-input]').press('Enter');
  await page.locator('[data-pdf-page-input]').dispatchEvent('change');
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue('40');
  await goToSaved(page);
  metrics.pdfResumeReady = await openFixture(page, 'rr4 long 180 page', 'pdf');
  budget('pdfResumeReady', metrics.pdfResumeReady as number, budgets.budgetsMs.resumeReady!);
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue('40');
  checkLongTasks(await longTasks(page), 'longPdfJourney');

  await session.detach();
  await attachMetrics(testInfo, metrics);
});

test('repeated EPUB/PDF open-close cycles have bounded retained memory', async ({ page }, testInfo) => {
  const session = await createLowEndSession(page);
  await importFixture(page, ordinaryEpubFixture, 'RR4 Ordinary EPUB');
  await importFixture(page, longPdfFixture, 'rr4 long 180 page');
  await goToSaved(page);
  const before = await collectStableMemory(session);

  for (let cycle = 0; cycle < budgets.memory.openCloseCycles; cycle += 1) {
    const epub = cycle % 2 === 0;
    await openFixture(page, epub ? 'RR4 Ordinary EPUB' : 'rr4 long 180 page', epub ? 'epub' : 'pdf');
    await goToSaved(page);
  }

  const after = await collectStableMemory(session);
  const growth = {
    heapBytes: positiveGrowth(after.heapBytes, before.heapBytes),
    nodes: positiveGrowth(after.nodes, before.nodes),
    frames: positiveGrowth(after.frames, before.frames),
  };
  budget('memory.heapGrowth', growth.heapBytes, budgets.memory.maximumHeapGrowthBytes, 'bytes');
  budget('memory.domNodeGrowth', growth.nodes, budgets.memory.maximumDomNodeGrowth, 'count');
  budget('memory.frameGrowth', growth.frames, budgets.memory.maximumFrameGrowth, 'count');

  await session.detach();
  await attachMetrics(testInfo, { before, after, growth });
});
