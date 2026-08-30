import { expect, test, type Page } from '@playwright/test';
import { personalEpubFixture, personalPdfFixture, secondPersonalPdfFixture } from './offline-fixtures';
import { setRr5Offline } from './offline-network';

const PERSONAL_DB = 'thiepn-library-personal-books';
const STABLE_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1';
const SW_CONTROL_TIMEOUT_MS = 30_000;
const SW_CONTROL_RELOAD_ATTEMPTS = 2;

const filePayload = (name: string, buffer: Buffer, mimeType = 'application/pdf') => ({ name, mimeType, buffer });

async function serviceWorkerControlState(page: Page) {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/library/');
    return {
      activeState: registration?.active?.state ?? '',
      controllerScript: navigator.serviceWorker.controller?.scriptURL ?? '',
      controllerState: navigator.serviceWorker.controller?.state ?? '',
    };
  });
}

async function ensureWorkerControlled(page: Page) {
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/library/');
    return Boolean(
      navigator.serviceWorker.controller
      || registration?.active?.state === 'activated'
    );
  }, undefined, { timeout: SW_CONTROL_TIMEOUT_MS });

  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 5_000 }).catch(() => {});
  }

  for (let attempt = 0; attempt < SW_CONTROL_RELOAD_ATTEMPTS; attempt++) {
    if (await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) break;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 10_000 }).catch(() => {});
  }

  const state = await serviceWorkerControlState(page);
  expect(state.activeState, `Service worker did not finish activation: ${JSON.stringify(state)}`).toBe('activated');
  expect(state.controllerScript, `Activated service worker did not control the page after bounded reloads: ${JSON.stringify(state)}`).toContain('/library/service-worker');
  expect(state.controllerState, `Service-worker controller is not activated: ${JSON.stringify(state)}`).toBe('activated');
}

test('@rr5 quota exhaustion is explicit and leaves no partial personal book', async ({ page }) => {
  await page.goto('/library/saved');
  await page.evaluate((dbName) => {
    const original = IDBObjectStore.prototype.put;
    (IDBObjectStore.prototype as unknown as { put: typeof IDBObjectStore.prototype.put }).put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name === dbName) throw new DOMException('RR5 quota simulation', 'QuotaExceededError');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  }, PERSONAL_DB);

  await page.locator('[data-personal-file-input]').setInputFiles(filePayload('RR5 quota.pdf', personalPdfFixture));
  await expect(page.locator('[data-personal-import-status]')).toContainText('full');
  await expect(page.locator('[data-personal-book]')).toHaveCount(0);
});

test('@rr5 interrupted write keeps the previously committed personal book intact', async ({ page }) => {
  await page.goto('/library/saved');
  const input = page.locator('[data-personal-file-input]');
  await input.setInputFiles(filePayload('RR5 Personal A.pdf', personalPdfFixture));
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'RR5 Personal A' })).toBeVisible();

  await page.evaluate((dbName) => {
    const original = IDBObjectStore.prototype.put;
    (IDBObjectStore.prototype as unknown as { put: typeof IDBObjectStore.prototype.put }).put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name === dbName) throw new DOMException('RR5 interrupted write simulation', 'AbortError');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  }, PERSONAL_DB);

  await input.setInputFiles(filePayload('RR5 Personal B.pdf', secondPersonalPdfFixture));
  await expect(page.locator('[data-personal-import-status]')).toContainText('interrupted');
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 3, name: 'RR5 Personal A' })).toBeVisible();
});

test('@rr5 denied IndexedDB becomes an explicit unavailable/private-session state', async ({ page }) => {
  await page.addInitScript((dbName) => {
    const original = IDBFactory.prototype.open;
    (IDBFactory.prototype as unknown as { open: typeof IDBFactory.prototype.open }).open = function(this: IDBFactory, name: string, version?: number) {
      if (name === dbName) throw new DOMException('RR5 storage denial simulation', 'SecurityError');
      return version === undefined ? original.call(this, name) : original.call(this, name, version);
    } as typeof IDBFactory.prototype.open;
  }, PERSONAL_DB);

  await page.goto('/library/saved');
  await expect(page.locator('[data-saved-count]')).toHaveText('Local library unavailable');
  await page.locator('[data-personal-file-input]').setInputFiles(filePayload('RR5 denied.pdf', personalPdfFixture));
  await expect(page.locator('[data-personal-import-status]')).toContainText('private-browsing restrictions');
});

test('@rr5 blocked v1 personal storage reports the older tab and then upgrades without data loss', async ({ page, context }) => {
  const blocker = await context.newPage();
  await blocker.goto('/library/');
  const setup = await blocker.evaluate(async (dbName) => {
    let stage = 'open';
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(dbName, 1);
        open.addEventListener('upgradeneeded', () => {
          if (!open.result.objectStoreNames.contains('books')) open.result.createObjectStore('books', { keyPath: 'id' });
        });
        open.addEventListener('success', () => resolve(open.result));
        open.addEventListener('error', () => reject(open.error ?? new Error('RR5 v1 database open failed.')));
      });

      stage = 'seed';
      const bytes = new TextEncoder().encode('%PDF-1.4\n%%EOF').buffer;
      const transaction = db.transaction('books', 'readwrite');
      const put = transaction.objectStore('books').put({
        id: 'pdf-rr5-v1-preserved',
        format: 'pdf',
        title: 'RR5 v1 preserved',
        fileName: 'rr5-v1.pdf',
        mimeType: 'application/pdf',
        size: bytes.byteLength,
        sha256: 'a'.repeat(64),
        importedAt: '2026-08-28T00:00:00.000Z',
        updatedAt: '2026-08-28T00:00:00.000Z',
        file: bytes,
      });
      await new Promise<void>((resolve, reject) => {
        put.addEventListener('error', () => reject(put.error ?? new Error('RR5 v1 seed request failed.')), { once: true });
        transaction.addEventListener('complete', () => resolve(), { once: true });
        transaction.addEventListener('error', () => reject(transaction.error ?? put.error ?? new Error('RR5 v1 seed transaction failed.')), { once: true });
        transaction.addEventListener('abort', () => reject(transaction.error ?? put.error ?? new DOMException('RR5 v1 seed transaction aborted.', 'AbortError')), { once: true });
      });
      (window as typeof window & { __rr5BlockedDb?: IDBDatabase }).__rr5BlockedDb = db;
      return { ok: true, stage: 'ready', name: '', message: '' };
    } catch (error) {
      return {
        ok: false,
        stage,
        name: error instanceof Error || error instanceof DOMException ? error.name : typeof error,
        message: error instanceof Error || error instanceof DOMException ? error.message : String(error),
      };
    }
  }, PERSONAL_DB);
  expect(setup).toEqual({ ok: true, stage: 'ready', name: '', message: '' });

  await page.goto('/library/saved');
  await expect(page.locator('[data-saved-count]')).toHaveText('Local library unavailable');
  const failure = page.locator('[data-library-error]');
  await expect(failure).toBeVisible();
  await expect(page.locator('[data-library-error-message]')).toContainText('blocked by another Library tab');
  const retry = failure.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();

  await blocker.evaluate(() => {
    (window as typeof window & { __rr5BlockedDb?: IDBDatabase }).__rr5BlockedDb?.close();
  });
  await blocker.close();
  await retry.click();
  await expect(failure).toBeHidden();
  await expect(page.getByRole('heading', { level: 3, name: 'RR5 v1 preserved' })).toBeVisible();
});

test('@rr5 personal books stay in IndexedDB and never enter hosted service-worker publication cache', async ({ page }) => {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(filePayload('RR5 Personal Cache Boundary.pdf', personalPdfFixture));
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);
  const cachedUrls = await page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    return (await cache.keys()).map((request) => request.url);
  }, STABLE_PUBLICATION_CACHE);
  expect(cachedUrls.some((url) => url.includes('/personal/') || url.startsWith('blob:'))).toBe(false);
});

test('@rr5 personal EPUB and PDF readers reopen offline while private files remain IndexedDB-only', async ({ page, context }) => {
  await page.goto('/library/saved');
  await ensureWorkerControlled(page);

  await page.locator('[data-personal-file-input]').setInputFiles([
    filePayload('RR5 Personal Offline.epub', personalEpubFixture, 'application/epub+zip'),
    filePayload('RR5 Personal Offline.pdf', personalPdfFixture),
  ]);
  await expect(page.locator('[data-personal-import-status]')).toContainText('2 imported', { timeout: 45_000 });
  await expect(page.locator('[data-personal-offline-status]')).toContainText('2 readers ready for offline use.', { timeout: 45_000 });

  const epubCard = page.locator('[data-personal-book]').filter({ has: page.getByRole('heading', { level: 3, name: 'RR5 Offline EPUB' }) });
  const pdfCard = page.locator('[data-personal-book]').filter({ has: page.getByRole('heading', { level: 3, name: 'RR5 Personal Offline' }) });
  const epubHref = await epubCard.locator('a.personal-book__action').getAttribute('href');
  const pdfHref = await pdfCard.locator('a.personal-book__action').getAttribute('href');
  expect(epubHref).toBeTruthy();
  expect(pdfHref).toBeTruthy();

  await setRr5Offline(context, true);
  try {
    await page.goto(epubHref!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
    await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();

    await page.goto(pdfHref!, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
    await expect.poll(async () => Number(await page.locator('[data-pdf-page-count]').textContent())).toBeGreaterThan(0);
  } finally {
    await setRr5Offline(context, false);
  }
});

test('@rr5 private-style ephemeral browser context does not persist personal books into a later session', async ({ browser }) => {
  test.skip(test.info().project.name !== 'chromium-offline', 'Ephemeral/private-style persistence is sampled once; failure injection runs cross-engine.');
  const first = await browser.newContext({ baseURL: 'http://127.0.0.1:4321', serviceWorkers: 'allow' });
  const firstPage = await first.newPage();
  await firstPage.goto('/library/saved');
  await firstPage.locator('[data-personal-file-input]').setInputFiles(filePayload('RR5 Private Session.pdf', personalPdfFixture));
  await expect(firstPage.locator('[data-personal-book]')).toHaveCount(1);
  await first.close();

  const second = await browser.newContext({ baseURL: 'http://127.0.0.1:4321', serviceWorkers: 'allow' });
  const secondPage = await second.newPage();
  await secondPage.goto('/library/saved');
  await expect(secondPage.locator('[data-personal-book]')).toHaveCount(0);
  await second.close();
});
