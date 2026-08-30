import { expect, test } from '@playwright/test';

const MAIN_DB = 'thiepn-library';

async function ensurePortableStorage(page: Parameters<typeof test>[0] extends never ? never : any) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-library-backup-export]').click(),
  ]);
  await download.path();
}

test('@rr8 duplicate backup identities are rejected before current state changes', async ({ page }) => {
  await page.goto('/library/backup');
  await ensurePortableStorage(page);

  await page.evaluate(async (dbName) => {
    const open = indexedDB.open(dbName, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = db.transaction('favorites', 'readwrite');
    transaction.objectStore('favorites').put({
      schemaVersion: 1,
      workId: 'existing-favorite',
      savedAt: '2026-08-30T20:00:00.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  }, MAIN_DB);

  const duplicateArchive = {
    format: 'thiepn-library-backup',
    schemaVersion: 1,
    exportedAt: '2026-08-30T20:30:00.000Z',
    state: {
      main: {
        schemaVersion: 1,
        favorites: {
          schemaVersion: 1,
          records: [
            { schemaVersion: 1, workId: 'duplicate-favorite', savedAt: '2026-08-30T20:30:00.000Z' },
            { schemaVersion: 1, workId: 'duplicate-favorite', savedAt: '2026-08-30T20:31:00.000Z' },
          ],
        },
      },
    },
  };

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'duplicate-library-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(duplicateArchive)),
  });

  await expect(page.locator('[data-library-backup-status]')).toContainText('Duplicate favorite identity');

  const workIds = await page.evaluate(async (dbName) => {
    const open = indexedDB.open(dbName, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const transaction = db.transaction('favorites', 'readonly');
    const values = await new Promise<Array<{ workId: string }>>((resolve, reject) => {
      const request = transaction.objectStore('favorites').getAll();
      request.onsuccess = () => resolve(request.result as Array<{ workId: string }>);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return values.map((record) => record.workId).sort();
  }, MAIN_DB);

  expect(workIds).toEqual(['existing-favorite']);
});
