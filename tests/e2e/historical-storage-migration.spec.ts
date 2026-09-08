import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const MAIN_DB = 'thiepn-library';
const PERSONAL_DB = 'thiepn-library-personal-books';
const SEED_PATH = '/library/__rr8-historical-storage-seed';

async function exportBackup(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-library-backup-export]').click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Backup download did not produce a local file.');
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
}

test('@rr8 historical main v8 and personal v2 records upgrade into versioned portable state deterministically', async ({ page }) => {
  // Seed the old schemas on a same-origin document that deliberately loads no
  // Library JavaScript. Navigating to /library/ first would let the current app
  // open v9, making deleteDatabase() legitimately block while that connection
  // is still alive and turning this migration regression into a timing race.
  await page.route(`**${SEED_PATH}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><title>RR8 historical storage seed</title></head><body></body></html>',
    });
  });
  await page.goto(SEED_PATH);

  await page.evaluate(async ({ mainDb, personalDb }) => {
    const remove = (name: string) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error(`Failed to delete IndexedDB database ${name}`));
      request.onblocked = () => reject(new Error(`IndexedDB deletion was blocked for ${name}`));
    });

    await remove(mainDb);
    await remove(personalDb);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(mainDb, 8);
      request.onupgradeneeded = () => {
        const db = request.result;
        const stores: Array<[string, string]> = [
          ['recent', 'workId'],
          ['progress', 'workId'],
          ['legacyProgress', 'workId'],
          ['bookmarks', 'id'],
          ['favorites', 'workId'],
          ['history', 'workId'],
          ['annotations', 'id'],
          ['annotationStats', 'workId'],
          ['readingSessions', 'id'],
          ['readingActivity', 'workId'],
        ];
        for (const [name, keyPath] of stores) db.createObjectStore(name, { keyPath });
        request.transaction!.objectStore('favorites').put({
          workId: 'historical-favorite',
          savedAt: '2026-01-01T00:00:00.000Z',
        });
        request.transaction!.objectStore('legacyProgress').put({
          workId: 'historical-work',
          chapterId: 'old-chapter',
          percent: 55,
          updatedAt: '2026-01-02T00:00:00.000Z',
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`Opening historical ${mainDb} v8 was blocked`));
    });

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(personalDb, 2);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('books', { keyPath: 'id' });
        store.put({
          id: `pdf-${'b'.repeat(32)}`,
          format: 'pdf',
          title: 'Historical personal PDF',
          fileName: 'historical.pdf',
          mimeType: 'application/pdf',
          size: 3,
          sha256: 'b'.repeat(64),
          importedAt: '2026-01-03T00:00:00.000Z',
          updatedAt: '2026-01-03T00:00:00.000Z',
          file: new Uint8Array([1, 2, 3]).buffer,
        });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`Opening historical ${personalDb} v2 was blocked`));
    });
  }, { mainDb: MAIN_DB, personalDb: PERSONAL_DB });

  await page.unroute(`**${SEED_PATH}`);
  await page.goto('/library/backup');

  const backup = await exportBackup(page);
  expect(backup.state.main.favorites.records).toEqual([
    expect.objectContaining({ schemaVersion: 1, workId: 'historical-favorite' }),
  ]);
  expect(backup.state.main.legacyProgress.records).toEqual([
    expect.objectContaining({ schemaVersion: 1, workId: 'historical-work', percent: 55 }),
  ]);
  expect(backup.state.personalBooks.records).toEqual([
    expect.objectContaining({
      schemaVersion: 1,
      title: 'Historical personal PDF',
      sha256: 'b'.repeat(64),
    }),
  ]);
});
