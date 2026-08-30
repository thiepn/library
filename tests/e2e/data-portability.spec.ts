import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const MAIN_DB = 'thiepn-library';
const PDF_DB = 'thiepn-library-pdf-reader';
const PERSONAL_DB = 'thiepn-library-personal-books';
const PENDING_PERSONAL_KEY = 'thiepn.library.personal-books.relink.v1';
const READER_SETTINGS_KEY = 'thiepn.library.reader.settings.v2';

async function exportBackup(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-library-backup-export]').click(),
  ]);
  const path = await download.path();
  if (!path) throw new Error('Backup download did not produce a local file.');
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
}

async function initializeStorage(page: Page) {
  await exportBackup(page);
}

async function restoreBackup(page: Page, backup: unknown) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'rr8-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
}

async function seedCurrentState(page: Page) {
  await page.evaluate(async ({ mainDb, pdfDb, pendingKey, readerSettingsKey }) => {
    const open = (name: string, version: number) => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const complete = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });

    const main = await open(mainDb, 9);
    const mainTx = main.transaction(['favorites', 'progress', 'legacyProgress', 'bookmarks', 'annotations', 'readingActivity'], 'readwrite');
    mainTx.objectStore('favorites').put({ schemaVersion: 1, workId: 'rr8-favorite', savedAt: '2026-08-30T18:00:00.000Z' });
    mainTx.objectStore('progress').put({
      schemaVersion: 2,
      workId: 'rr8-epub',
      edition: 2,
      releaseVersion: 'r7',
      cfi: 'epubcfi(/6/4!/4/2/2)',
      percentage: 0.42,
      furthestPercentage: 0.61,
      chapterHref: 'chapter-4.xhtml',
      chapterLabel: 'Chapter 4',
      updatedAt: '2026-08-30T18:01:00.000Z',
    });
    mainTx.objectStore('legacyProgress').put({
      schemaVersion: 1,
      workId: 'rr8-legacy',
      chapterId: 'chapter-2',
      percent: 37,
      updatedAt: '2026-08-30T18:02:00.000Z',
    });
    mainTx.objectStore('bookmarks').put({
      schemaVersion: 2,
      id: 'rr8-bookmark',
      workId: 'rr8-epub',
      edition: 2,
      releaseVersion: 'r7',
      cfi: 'epubcfi(/6/4!/4/2/2)',
      href: 'chapter-4.xhtml',
      chapterLabel: 'Chapter 4',
      spineIndex: 3,
      percentage: 0.42,
      createdAt: '2026-08-30T18:03:00.000Z',
      updatedAt: '2026-08-30T18:03:00.000Z',
    });
    mainTx.objectStore('annotations').put({
      schemaVersion: 2,
      id: 'rr8-annotation',
      workId: 'rr8-epub',
      edition: 2,
      releaseVersion: 'r7',
      cfiRange: 'epubcfi(/6/4!/4/2/2,/1:0,/1:8)',
      href: 'chapter-4.xhtml',
      chapterLabel: 'Chapter 4',
      spineIndex: 3,
      percentage: 0.42,
      quote: 'Portable annotation',
      note: 'Portable note',
      createdAt: '2026-08-30T18:04:00.000Z',
      updatedAt: '2026-08-30T18:04:00.000Z',
    });
    mainTx.objectStore('readingActivity').put({
      schemaVersion: 1,
      workId: 'rr8-epub',
      edition: 2,
      releaseVersion: 'r7',
      format: 'epub',
      source: 'hosted',
      openedAt: '2026-08-30T18:05:00.000Z',
    });
    await complete(mainTx);
    main.close();

    const pdf = await open(pdfDb, 1);
    const pdfTx = pdf.transaction(['progress', 'bookmarks'], 'readwrite');
    const identity = { workId: 'rr8-pdf', edition: 1, releaseVersion: 'pdf-r1' };
    const publicationKey = 'rr8-pdf::1::pdf-r1';
    pdfTx.objectStore('progress').put({
      schemaVersion: 1,
      id: publicationKey,
      identity,
      page: 2,
      furthestPage: 5,
      pageCount: 10,
      updatedAt: '2026-08-30T18:06:00.000Z',
    });
    pdfTx.objectStore('bookmarks').put({
      schemaVersion: 1,
      id: `${publicationKey}::page:2`,
      publicationKey,
      identity,
      page: 2,
      label: 'Page 2',
      createdAt: '2026-08-30T18:07:00.000Z',
    });
    await complete(pdfTx);
    pdf.close();

    localStorage.setItem(readerSettingsKey, JSON.stringify({
      schemaVersion: 1,
      fontFamily: 'literata',
      fontScale: 1.1,
      lineHeight: 1.55,
      paragraphSpacing: 0.2,
      alignment: 'left',
      theme: 'warm',
      textWidth: 'medium',
      pageMargins: 'medium',
      flow: 'paginated',
      spread: 'auto',
    }));
    localStorage.setItem('thiepn.library.settings.v1', JSON.stringify({ appearance: 'dark' }));
    localStorage.setItem('thiepn.library.reader.v1', JSON.stringify({ scale: 1.1, measure: 74 }));
    localStorage.setItem(pendingKey, JSON.stringify([{
      schemaVersion: 1,
      id: `pdf-${'a'.repeat(32)}`,
      format: 'pdf',
      title: 'Portable personal book',
      fileName: 'portable.pdf',
      mimeType: 'application/pdf',
      size: 1234,
      sha256: 'a'.repeat(64),
      importedAt: '2026-08-30T18:08:00.000Z',
      updatedAt: '2026-08-30T18:08:00.000Z',
    }]));
  }, { mainDb: MAIN_DB, pdfDb: PDF_DB, pendingKey: PENDING_PERSONAL_KEY, readerSettingsKey: READER_SETTINGS_KEY });
}

test('@rr8 full backup round-trips reading state without embedding personal files', async ({ page }) => {
  await page.goto('/library/backup');
  await initializeStorage(page);
  await seedCurrentState(page);

  const backup = await exportBackup(page);
  expect(backup.format).toBe('thiepn-library-backup');
  expect(backup.schemaVersion).toBe(1);
  expect(backup.state.main.favorites.records).toEqual([expect.objectContaining({ schemaVersion: 1, workId: 'rr8-favorite' })]);
  expect(backup.state.main.epubProgress.records[0]).toMatchObject({ workId: 'rr8-epub', releaseVersion: 'r7', furthestPercentage: 0.61 });
  expect(backup.state.pdf.progress.records[0]).toMatchObject({ page: 2, furthestPage: 5 });
  expect(backup.state.personalBooks.includesFiles).toBe(false);
  expect(backup.state.personalBooks.records[0]).toMatchObject({ schemaVersion: 1, sha256: 'a'.repeat(64) });
  expect(JSON.stringify(backup.state.personalBooks)).not.toMatch(/"file"|"cover"|"data"/);

  await page.evaluate(async ({ mainDb, pendingKey, readerSettingsKey }) => {
    const request = indexedDB.open(mainDb, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').clear();
    tx.objectStore('favorites').put({ schemaVersion: 1, workId: 'mutated', savedAt: new Date().toISOString() });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem(readerSettingsKey, JSON.stringify({
      schemaVersion: 1, fontFamily: 'serif', fontScale: 1, lineHeight: 1.5, paragraphSpacing: 0,
      alignment: 'justify', theme: 'dark', textWidth: 'wide', pageMargins: 'large', flow: 'scrolled', spread: 'single',
    }));
    localStorage.setItem(pendingKey, '[]');
  }, { mainDb: MAIN_DB, pendingKey: PENDING_PERSONAL_KEY, readerSettingsKey: READER_SETTINGS_KEY });

  await restoreBackup(page, backup);
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');
  await expect(page.locator('[data-library-backup-status]')).toContainText('1 personal book file');

  const restored = await page.evaluate(async ({ mainDb, pendingKey, readerSettingsKey }) => {
    const request = indexedDB.open(mainDb, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['favorites', 'progress'], 'readonly');
    const favorite = await new Promise<any>((resolve, reject) => {
      const get = tx.objectStore('favorites').get('rr8-favorite');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    const progress = await new Promise<any>((resolve, reject) => {
      const get = tx.objectStore('progress').get('rr8-epub');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return {
      favorite,
      progress,
      settings: JSON.parse(localStorage.getItem(readerSettingsKey) ?? 'null'),
      pending: JSON.parse(localStorage.getItem(pendingKey) ?? '[]'),
    };
  }, { mainDb: MAIN_DB, pendingKey: PENDING_PERSONAL_KEY, readerSettingsKey: READER_SETTINGS_KEY });

  expect(restored.favorite.workId).toBe('rr8-favorite');
  expect(restored.progress).toMatchObject({ workId: 'rr8-epub', releaseVersion: 'r7', percentage: 0.42 });
  expect(restored.settings.theme).toBe('warm');
  expect(restored.pending).toHaveLength(1);
});

test('@rr8 partial restore leaves omitted categories unchanged and rejects corrupt input before writes', async ({ page }) => {
  await page.goto('/library/backup');
  await initializeStorage(page);
  await seedCurrentState(page);

  const partial = {
    format: 'thiepn-library-backup',
    schemaVersion: 1,
    exportedAt: '2026-08-30T19:00:00.000Z',
    state: {
      main: {
        schemaVersion: 1,
        favorites: { schemaVersion: 1, records: [{ schemaVersion: 1, workId: 'partial-favorite', savedAt: '2026-08-30T19:00:00.000Z' }] },
      },
    },
  };
  await restoreBackup(page, partial);
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');

  const state = await page.evaluate(async (mainDb) => {
    const request = indexedDB.open(mainDb, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['favorites', 'progress'], 'readonly');
    const favorites = await new Promise<any[]>((resolve, reject) => {
      const get = tx.objectStore('favorites').getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    const progress = await new Promise<any>((resolve, reject) => {
      const get = tx.objectStore('progress').get('rr8-epub');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return { favorites, progress };
  }, MAIN_DB);
  expect(state.favorites.map((record) => record.workId)).toEqual(['partial-favorite']);
  expect(state.progress.workId).toBe('rr8-epub');

  await restoreBackup(page, { ...partial, schemaVersion: 99 });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Unsupported Library backup schema version');
  const afterCorrupt = await page.evaluate(async (mainDb) => {
    const request = indexedDB.open(mainDb, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('favorites', 'readonly');
    const values = await new Promise<any[]>((resolve, reject) => {
      const get = tx.objectStore('favorites').getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return values.map((record) => record.workId);
  }, MAIN_DB);
  expect(afterCorrupt).toEqual(['partial-favorite']);
});

test('@rr8 failed cross-backend restore compensates back to the previous committed state', async ({ page }) => {
  await page.goto('/library/backup');
  await initializeStorage(page);
  await seedCurrentState(page);

  const target = await exportBackup(page);
  target.state.main.favorites.records = [{ schemaVersion: 1, workId: 'target-favorite', savedAt: '2026-08-30T20:00:00.000Z' }];
  target.state.pdf.progress.records = [{
    schemaVersion: 1,
    id: 'target-pdf::1::r2',
    identity: { workId: 'target-pdf', edition: 1, releaseVersion: 'r2' },
    page: 7,
    furthestPage: 7,
    pageCount: 9,
    updatedAt: '2026-08-30T20:00:00.000Z',
  }];

  await page.evaluate((pdfDb) => {
    const original = IDBObjectStore.prototype.put;
    let inject = true;
    (IDBObjectStore.prototype as unknown as { put: typeof IDBObjectStore.prototype.put }).put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (inject && this.transaction.db.name === pdfDb && this.name === 'progress') {
        inject = false;
        throw new DOMException('RR8 rollback simulation', 'QuotaExceededError');
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  }, PDF_DB);

  await restoreBackup(page, target);
  await expect(page.locator('[data-library-backup-status]')).toContainText('previous state was restored');

  const favorites = await page.evaluate(async (mainDb) => {
    const request = indexedDB.open(mainDb, 9);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('favorites', 'readonly');
    const values = await new Promise<any[]>((resolve, reject) => {
      const get = tx.objectStore('favorites').getAll();
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    db.close();
    return values.map((record) => record.workId).sort();
  }, MAIN_DB);
  expect(favorites).toEqual(['rr8-favorite']);
});

test('@rr8 historical main v8 and personal v2 records upgrade into versioned portable state', async ({ page }) => {
  await page.goto('/library/');
  await page.evaluate(async ({ mainDb, personalDb }) => {
    const remove = (name: string) => new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    });
    await remove(mainDb);
    await remove(personalDb);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(mainDb, 8);
      request.onupgradeneeded = () => {
        const db = request.result;
        const stores: Array<[string, string]> = [
          ['recent', 'workId'], ['progress', 'workId'], ['legacyProgress', 'workId'], ['bookmarks', 'id'],
          ['favorites', 'workId'], ['history', 'workId'], ['annotations', 'id'], ['annotationStats', 'workId'],
          ['readingSessions', 'id'], ['readingActivity', 'workId'],
        ];
        for (const [name, keyPath] of stores) db.createObjectStore(name, { keyPath });
        request.transaction!.objectStore('favorites').put({ workId: 'historical-favorite', savedAt: '2026-01-01T00:00:00.000Z' });
        request.transaction!.objectStore('legacyProgress').put({ workId: 'historical-work', chapterId: 'old-chapter', percent: 55, updatedAt: '2026-01-02T00:00:00.000Z' });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
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
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { mainDb: MAIN_DB, personalDb: PERSONAL_DB });

  await page.goto('/library/backup');
  const backup = await exportBackup(page);
  expect(backup.state.main.favorites.records).toEqual([
    expect.objectContaining({ schemaVersion: 1, workId: 'historical-favorite' }),
  ]);
  expect(backup.state.main.legacyProgress.records).toEqual([
    expect.objectContaining({ schemaVersion: 1, workId: 'historical-work', percent: 55 }),
  ]);
  expect(backup.state.personalBooks.records).toEqual([
    expect.objectContaining({ schemaVersion: 1, title: 'Historical personal PDF', sha256: 'b'.repeat(64) }),
  ]);
});
