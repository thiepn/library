import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { largeEpubFixture, largePdfFixture, oversizedPdfFixture } from './performance-fixtures';
import type { BrowserFixtureFile } from './fixtures';

const MIB = 1024 * 1024;
const BUDGETS = {
  epubImportMs: 20_000,
  epubOpenMs: 20_000,
  epubNextMs: 3_000,
  pdfImportMs: 15_000,
  pdfOpenMs: 15_000,
  pdfNavigateMs: 3_000,
  pdfSearchMs: 20_000,
  heapGrowthBytes: 96 * MIB,
  rasterPixels: 16_000_000,
  rasterDimension: 8_192,
} as const;

function watchPageErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  return () => expect(errors, `Unhandled browser errors:\n${errors.join('\n\n')}`).toEqual([]);
}

async function throttleCpu(page: Page, rate = 4): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  return session;
}

async function collectHeap(session: CDPSession): Promise<number> {
  await session.send('HeapProfiler.collectGarbage');
  const usage = await session.send('Runtime.getHeapUsage') as { usedSize: number };
  return usage.usedSize;
}

async function importBook(page: Page, fixture: BrowserFixtureFile, title: string): Promise<{ card: Locator; elapsedMs: number }> {
  await page.goto('/library/saved');
  await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  const started = Date.now();
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  const elapsedMs = Date.now() - started;
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toBeVisible();
  return { card, elapsedMs };
}

async function attachMetrics(metrics: Record<string, number | string>): Promise<void> {
  await test.info().attach('rr4-metrics', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json',
  });
}

test('@rr4 large EPUB stays responsive under the controlled CPU profile', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const cdp = await throttleCpu(page);
  const metrics: Record<string, number | string> = {};

  try {
    const imported = await importBook(page, largeEpubFixture, 'RR4 Large EPUB');
    metrics.epubImportMs = imported.elapsedMs;
    expect(imported.elapsedMs).toBeLessThanOrEqual(BUDGETS.epubImportMs);

    const openedAt = Date.now();
    await imported.card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
    const shell = page.locator('[data-reader-shell]');
    await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
    const openMs = Date.now() - openedAt;
    metrics.epubOpenMs = openMs;
    expect(openMs).toBeLessThanOrEqual(BUDGETS.epubOpenMs);
    await expect(page.locator('[data-reader-title]')).toHaveText('RR4 Large EPUB');
    await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();

    const next = page.locator('[data-reader-command="next"]');
    await expect(next).toBeEnabled();
    const progress = page.locator('[data-reader-progress]');
    const before = (await progress.textContent()) ?? '';
    const nextAt = Date.now();
    await next.click();
    await expect.poll(async () => (await progress.textContent()) ?? '', { timeout: BUDGETS.epubNextMs })
      .not.toBe(before);
    const nextMs = Date.now() - nextAt;
    metrics.epubNextMs = nextMs;
    expect(nextMs).toBeLessThanOrEqual(BUDGETS.epubNextMs);

    const bootMs = Number(await shell.getAttribute('data-reader-boot-ms'));
    if (Number.isFinite(bootMs) && bootMs > 0) metrics.readerBootMs = Math.round(bootMs);
    await attachMetrics(metrics);
    assertNoPageErrors();
  } finally {
    await cdp.detach();
  }
});

test('@rr4 160-page PDF opens, navigates, and searches within budgets', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const cdp = await throttleCpu(page);
  const metrics: Record<string, number | string> = {};

  try {
    const imported = await importBook(page, largePdfFixture, 'RR4 Large PDF');
    metrics.pdfImportMs = imported.elapsedMs;
    expect(imported.elapsedMs).toBeLessThanOrEqual(BUDGETS.pdfImportMs);

    const openedAt = Date.now();
    await imported.card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
    const root = page.locator('[data-pdf-reader-root]');
    await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
    const openMs = Date.now() - openedAt;
    metrics.pdfOpenMs = openMs;
    expect(openMs).toBeLessThanOrEqual(BUDGETS.pdfOpenMs);
    await expect(page.locator('[data-pdf-page-count]')).toHaveText('160');

    const pageInput = page.locator('[data-pdf-page-input]');
    const navigateAt = Date.now();
    await pageInput.fill('160');
    await pageInput.dispatchEvent('change');
    await expect(page.locator('[data-pdf-status]')).toHaveText('Page 160 of 160', { timeout: BUDGETS.pdfNavigateMs });
    const navigateMs = Date.now() - navigateAt;
    metrics.pdfNavigateMs = navigateMs;
    expect(navigateMs).toBeLessThanOrEqual(BUDGETS.pdfNavigateMs);

    await page.locator('[data-pdf-search-toggle]').click();
    await page.locator('[data-pdf-search-input]').fill('RR4 FINAL PDF PERFORMANCE MARKER');
    const searchAt = Date.now();
    await page.locator('[data-pdf-search-submit]').click();
    await expect(page.locator('[data-pdf-search-status]')).toContainText('matching page', { timeout: BUDGETS.pdfSearchMs });
    await expect(page.locator('[data-pdf-search-results]')).toContainText('Page 160');
    const searchMs = Date.now() - searchAt;
    metrics.pdfSearchMs = searchMs;
    expect(searchMs).toBeLessThanOrEqual(BUDGETS.pdfSearchMs);

    const rasterPixels = Number(await root.getAttribute('data-pdf-raster-pixels'));
    metrics.pdfRasterPixels = rasterPixels;
    expect(rasterPixels).toBeGreaterThan(0);
    expect(rasterPixels).toBeLessThanOrEqual(BUDGETS.rasterPixels);

    await attachMetrics(metrics);
    assertNoPageErrors();
  } finally {
    await cdp.detach();
  }
});

test('@rr4 oversized PDF fit and raster allocation remain bounded', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const imported = await importBook(page, oversizedPdfFixture, 'RR4 Oversized PDF');
  await imported.card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();

  const root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  const canvas = page.locator('[data-pdf-canvas]');
  const viewport = page.locator('[data-pdf-viewport]');
  const geometry = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-pdf-canvas]');
    const viewport = document.querySelector<HTMLElement>('[data-pdf-viewport]');
    const root = document.querySelector<HTMLElement>('[data-pdf-reader-root]');
    if (!canvas || !viewport || !root) return null;
    return {
      cssWidth: canvas.getBoundingClientRect().width,
      viewportWidth: viewport.clientWidth,
      rasterWidth: canvas.width,
      rasterHeight: canvas.height,
      rasterPixels: Number(root.dataset.pdfRasterPixels ?? 0),
      rasterRatio: Number(root.dataset.pdfRasterRatio ?? 0),
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;
  expect(geometry.cssWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.rasterWidth).toBeLessThanOrEqual(BUDGETS.rasterDimension);
  expect(geometry.rasterHeight).toBeLessThanOrEqual(BUDGETS.rasterDimension);
  expect(geometry.rasterPixels).toBeLessThanOrEqual(BUDGETS.rasterPixels);
  expect(geometry.rasterRatio).toBeGreaterThan(0);
  await expect(canvas).toBeVisible();
  await attachMetrics({
    oversizedCssWidth: Math.round(geometry.cssWidth),
    oversizedRasterWidth: geometry.rasterWidth,
    oversizedRasterHeight: geometry.rasterHeight,
    oversizedRasterPixels: geometry.rasterPixels,
    oversizedRasterRatio: geometry.rasterRatio,
  });
  assertNoPageErrors();
});

test('@rr4 repeated integrated PDF lifecycle has bounded JavaScript heap growth', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const cdp = await page.context().newCDPSession(page);
  const imported = await importBook(page, largePdfFixture, 'RR4 Large PDF');

  const openAndClose = async () => {
    const card = page.locator('[data-personal-book]').filter({
      has: page.getByRole('heading', { level: 3, name: 'RR4 Large PDF', exact: true }),
    });
    await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
    await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
    await page.goto('/library/saved');
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  };

  try {
    await imported.card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
    await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
    await page.goto('/library/saved');
    const baseline = await collectHeap(cdp);

    for (let cycle = 0; cycle < 5; cycle += 1) await openAndClose();
    const after = await collectHeap(cdp);
    const growth = Math.max(0, after - baseline);

    await attachMetrics({
      baselineHeapMiB: Number((baseline / MIB).toFixed(2)),
      finalHeapMiB: Number((after / MIB).toFixed(2)),
      heapGrowthMiB: Number((growth / MIB).toFixed(2)),
    });
    expect(growth).toBeLessThanOrEqual(BUDGETS.heapGrowthBytes);
    assertNoPageErrors();
  } finally {
    await cdp.detach();
  }
});
