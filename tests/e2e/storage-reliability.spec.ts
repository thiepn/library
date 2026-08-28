import { expect, test } from '@playwright/test';
import { personalPdfFixture, secondPersonalPdfFixture } from './offline-fixtures';

const PERSONAL_DB = 'thiepn-library-personal-books';
const STABLE_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1';

const filePayload = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

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
  await blocker.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 1);
      open.addEventListener('upgradeneeded', () => {
        if (!open.result.objectStoreNames.contains('books')) open.result.createObjectStore('books', { keyPath: 'id' });
      });
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const transaction = db.transaction('books', 'readwrite');
    transaction.objectStore('books').put({
      id: 'pdf-rr5-v1-preserved',
      format: 'pdf',
      title: 'RR5 v1 preserved',
      fileName: 'rr5-v1.pdf',
      mimeType: 'application/pdf',
      size: 12,
      sha256: 'a'.repeat(64),
      importedAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
      file: new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }),
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve());
      transaction.addEventListener('error', () => reject(transaction.error));
      transaction.addEventListener('abort', () => reject(transaction.error));
    });
    (window as typeof window & { __rr5BlockedDb?: IDBDatabase }).__rr5BlockedDb = db;
  }, PERSONAL_DB);

  await page.goto('/library/saved');
  await expect(page.locator('[data-saved-count]')).toHaveText('Local library unavailable');
  await expect(page.locator('[data-saved-empty]')).toContainText('did not allow the local Library database to open');

  await blocker.evaluate(() => {
    (window as typeof window & { __rr5BlockedDb?: IDBDatabase }).__rr5BlockedDb?.close();
  });
  await blocker.close();
  await page.reload();
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
