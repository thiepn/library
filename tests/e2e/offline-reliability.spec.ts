import { expect, test, type Page } from '@playwright/test';
import { prepareOfflineHostedFixtures } from './offline-fixtures';

const STABLE_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1';
let fixtures: Awaited<ReturnType<typeof prepareOfflineHostedFixtures>>;

test.beforeAll(async () => {
  fixtures = await prepareOfflineHostedFixtures();
});

async function ensureControlled(page: Page) {
  await page.goto('/library/downloads');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/library/');
    return Boolean(registration?.active || navigator.serviceWorker.controller);
  }, undefined, { timeout: 15_000 });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 15_000 });
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Offline downloads' })).toBeVisible();
}

async function fixtureRow(page: Page, fixture: { urlPath: string; sizeBytes: number }) {
  const row = page.locator(`[data-offline-artifact][data-offline-url="${fixture.urlPath}"]`);
  await expect(row).toHaveCount(1);
  await row.evaluate((node, size) => { (node as HTMLElement).dataset.offlineSize = String(size); }, fixture.sizeBytes);
  return row;
}

async function download(page: Page, fixture: { urlPath: string; sizeBytes: number }, format: 'EPUB' | 'PDF') {
  const row = await fixtureRow(page, fixture);
  const action = row.locator('[data-offline-artifact-action]');
  await expect(action).toBeEnabled();
  await expect(action).toContainText(`Download ${format}`);
  await action.click();
  await expect(row.locator('[data-offline-artifact-status]')).toContainText('Available offline', { timeout: 45_000 });
  return row;
}

test('@rr5 visited catalog and My Library reopen after restart-style offline navigation', async ({ page, context }) => {
  await ensureControlled(page);
  await page.goto('/library/');
  await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  await page.goto('/library/saved');
  await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.goto('/library/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
    await page.goto('/library/saved', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('@rr5 explicit EPUB download survives restart-style offline navigation', async ({ page, context }) => {
  await ensureControlled(page);
  const row = await download(page, fixtures.epub, 'EPUB');
  const readerUrl = await row.getAttribute('data-offline-reader-url');
  expect(readerUrl).toBeTruthy();

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Offline downloads' })).toBeVisible();
    await page.goto(readerUrl!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
    await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('@rr5 explicit PDF download reopens offline with cached byte-range support', async ({ page, context }) => {
  await ensureControlled(page);
  const row = await download(page, fixtures.pdf, 'PDF');
  const readerUrl = await row.getAttribute('data-offline-reader-url');
  expect(readerUrl).toBeTruthy();

  await context.setOffline(true);
  try {
    await page.goto(readerUrl!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
    await expect.poll(async () => Number(await page.locator('[data-pdf-page-count]').textContent())).toBeGreaterThan(0);
  } finally {
    await context.setOffline(false);
  }
});

test('@rr5 removal and simulated cache eviction become explicit unavailable states', async ({ page }) => {
  await ensureControlled(page);
  let row = await download(page, fixtures.epub, 'EPUB');
  const action = row.locator('[data-offline-artifact-action]');
  await expect(action).toContainText('Remove download');
  await action.click();
  await expect(row.locator('[data-offline-artifact-status]')).toHaveText('Not downloaded');

  row = await download(page, fixtures.epub, 'EPUB');
  await page.evaluate(async (cacheName) => { await caches.delete(cacheName); }, STABLE_PUBLICATION_CACHE);
  await page.reload();
  row = await fixtureRow(page, fixtures.epub);
  await expect(row.locator('[data-offline-artifact-status]')).toHaveText('Not downloaded');
  await expect(page.locator('[data-offline-global-status]')).toContainText('No hosted publication files');
});

test('@rr5 waiting worker preserves active controller, reader routes, cache migration, and rollback', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium-offline', 'Service-worker update lifecycle is kept on one deterministic engine; offline reopen runs cross-engine.');
  await ensureControlled(page);
  const downloadedRow = await download(page, fixtures.epub, 'EPUB');
  const readerUrl = await downloadedRow.getAttribute('data-offline-reader-url');
  expect(readerUrl).toBeTruthy();

  const initialController = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
  expect(initialController).toContain('/library/service-worker.js');

  await page.evaluate(async ({ legacyUrl, staleCache, legacyCache }) => {
    const legacy = await caches.open(legacyCache);
    const response = await fetch(legacyUrl);
    await legacy.put(legacyUrl, response);
    const stale = await caches.open(staleCache);
    await stale.put('/library/rr5-stale-marker', new Response('stale'));
  }, {
    legacyUrl: fixtures.epub.urlPath,
    staleCache: 'thiepn-library-pwa-runtime-stale-rr5-test',
    legacyCache: 'thiepn-library-pwa-publication-p28-v1',
  });

  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/library/service-worker-next.js', { scope: '/library/', updateViaCache: 'none' });
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/library/'))?.waiting?.scriptURL ?? ''), { timeout: 20_000 })
    .toContain('service-worker-next.js');
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toBe(initialController);

  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/library/');
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  await page.waitForFunction((previous) => Boolean(navigator.serviceWorker.controller?.scriptURL) && navigator.serviceWorker.controller?.scriptURL !== previous, initialController);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('service-worker-next.js');

  const migration = await page.evaluate(async ({ stableCache, legacyCache, staleCache, url }) => {
    const stable = await caches.open(stableCache);
    return {
      migrated: Boolean(await stable.match(url)),
      legacyPreserved: (await caches.keys()).includes(legacyCache),
      staleRemoved: !(await caches.keys()).includes(staleCache),
      staleMarkerAbsent: !(await caches.match('/library/rr5-stale-marker')),
    };
  }, {
    stableCache: STABLE_PUBLICATION_CACHE,
    legacyCache: 'thiepn-library-pwa-publication-p28-v1',
    staleCache: 'thiepn-library-pwa-runtime-stale-rr5-test',
    url: fixtures.epub.urlPath,
  });
  expect(migration).toEqual({ migrated: true, legacyPreserved: true, staleRemoved: true, staleMarkerAbsent: true });

  await context.setOffline(true);
  try {
    await page.goto(readerUrl!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  } finally {
    await context.setOffline(false);
  }

  const nextController = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/library/service-worker.js', { scope: '/library/', updateViaCache: 'none' });
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/library/'))?.waiting?.scriptURL ?? ''), { timeout: 20_000 })
    .toContain('/library/service-worker.js');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/library/');
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  });
  await page.waitForFunction((previous) => Boolean(navigator.serviceWorker.controller?.scriptURL) && navigator.serviceWorker.controller?.scriptURL !== previous, nextController);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '')).toContain('/library/service-worker.js');
  expect(await page.evaluate(async ({ stableCache, url }) => Boolean(await (await caches.open(stableCache)).match(url)), { stableCache: STABLE_PUBLICATION_CACHE, url: fixtures.epub.urlPath })).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto(readerUrl!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  } finally {
    await context.setOffline(false);
  }
});
