import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createLibraryBackupArchive } from '../../src/lib/data-portability/archive';

const MAIN_DB = 'thiepn-library';
const PERSONAL_DB = 'thiepn-library-personal-books';
const LEGACY_PDF_DB = 'thiepn-library-pdf-reader';
const APP_SETTINGS_KEY = 'thiepn.library.settings.v1';

const MAIN_V8_STORES = [
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
] as const;

async function resetMainDb(page: Page, version: 8 | 9) {
  await page.evaluate(async ({ dbName, version, definitions }) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(dbName);
      deletion.addEventListener('success', () => resolve(), { once: true });
      deletion.addEventListener('error', () => reject(deletion.error ?? new Error('DB deletion failed')), { once: true });
      deletion.addEventListener('blocked', () => reject(new Error('DB deletion was blocked')), { once: true });
    });

    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(dbName, version);
      open.addEventListener('upgradeneeded', () => {
        for (const [name, keyPath] of definitions) {
          if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath });
        }
        if (version >= 9) {
          if (!open.result.objectStoreNames.contains('pdfProgress')) open.result.createObjectStore('pdfProgress', { keyPath: 'id' });
          if (!open.result.objectStoreNames.contains('pdfBookmarks')) {
            const store = open.result.createObjectStore('pdfBookmarks', { keyPath: 'id' });
            store.createIndex('publicationKey', 'publicationKey', { unique: false });
          }
          if (!open.result.objectStoreNames.contains('portablePersonalMetadata')) open.result.createObjectStore('portablePersonalMetadata', { keyPath: 'id' });
        }
      });
      open.addEventListener('success', () => { open.result.close(); resolve(); }, { once: true });
      open.addEventListener('error', () => reject(open.error ?? new Error('DB open failed')), { once: true });
    });
  }, { dbName: MAIN_DB, version, definitions: MAIN_V8_STORES });
}

async function backupJsonFromDownload(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-backup-download]').click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Backup download has no readable local path.');
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;
}

async function restoreArchive(page: Page, archive: unknown) {
  await page.locator('[data-backup-file]').setInputFiles({
    name: 'rr8-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(archive)),
  });
  await page.locator('[data-backup-restore]').click();
}

test('@rr8 v8 main state upgrades to v9 without losing authoritative reading data', async ({ page }) => {
  await page.goto('/library/data');
  await resetMainDb(page, 8);
  await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 8);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const transaction = db.transaction(['favorites', 'progress', 'legacyProgress', 'annotations'], 'readwrite');
    transaction.objectStore('favorites').put({ workId: 'rr8-favorite', savedAt: '2026-08-20T00:00:00.000Z' });
    transaction.objectStore('progress').put({
      schemaVersion: 2,
      workId: 'rr8-native',
      edition: 3,
      releaseVersion: '3.2.1',
      cfi: 'epubcfi(/6/2!/4/2/1:0)',
      percentage: 0.42,
      furthestPercentage: 0.55,
      updatedAt: '2026-08-21T00:00:00.000Z',
    });
    transaction.objectStore('legacyProgress').put({
      workId: 'rr8-legacy',
      chapterId: 'chapter-4',
      percent: 38,
      updatedAt: '2026-08-22T00:00:00.000Z',
    });
    transaction.objectStore('annotations').put({
      id: 'legacy-note-1',
      workId: 'rr8-legacy',
      chapterId: 'chapter-4',
      note: 'Preserve this note',
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error), { once: true });
    });
    db.close();
  }, MAIN_DB);

  const backup = await backupJsonFromDownload(page);
  expect(backup.sections.favorites).toContainEqual(expect.objectContaining({ schemaVersion: 1, workId: 'rr8-favorite' }));
  expect(backup.sections.epubProgress).toContainEqual(expect.objectContaining({ workId: 'rr8-native', releaseVersion: '3.2.1', cfi: 'epubcfi(/6/2!/4/2/1:0)' }));
  expect(backup.sections.legacyProgress).toContainEqual(expect.objectContaining({ schemaVersion: 1, workId: 'rr8-legacy', chapterId: 'chapter-4' }));
  expect(backup.sections.legacyAnnotations).toContainEqual(expect.objectContaining({ schemaVersion: 1, id: 'legacy-note-1' }));

  const schema = await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const result = { version: db.version, stores: [...db.objectStoreNames] };
    db.close();
    return result;
  }, MAIN_DB);
  expect(schema.version).toBe(9);
  expect(schema.stores).toEqual(expect.arrayContaining(['pdfProgress', 'pdfBookmarks', 'portablePersonalMetadata']));
});

test('@rr8 restore keeps a current EPUB release position instead of overwriting it with stale backup state', async ({ page }) => {
  await page.goto('/library/data');
  await resetMainDb(page, 9);
  await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 9);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const transaction = db.transaction('progress', 'readwrite');
    transaction.objectStore('progress').put({
      schemaVersion: 2,
      workId: 'rr8-release-guard',
      edition: 2,
      releaseVersion: 'current-release',
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      percentage: 0.64,
      furthestPercentage: 0.7,
      updatedAt: '2026-08-30T18:00:00.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    db.close();
  }, MAIN_DB);

  const archive = createLibraryBackupArchive({
    sections: {
      epubProgress: [{
        schemaVersion: 2,
        workId: 'rr8-release-guard',
        edition: 1,
        releaseVersion: 'old-release',
        cfi: 'epubcfi(/6/2!/4/2/1:0)',
        percentage: 0.9,
        furthestPercentage: 0.9,
        updatedAt: '2026-08-30T20:00:00.000Z',
      }],
    },
  });
  await restoreArchive(page, archive);
  await expect(page.locator('[data-restore-status]')).toContainText('newer current record');

  const stored = await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 9);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const value = await new Promise<any>((resolve, reject) => {
      const get = db.transaction('progress', 'readonly').objectStore('progress').get('rr8-release-guard');
      get.addEventListener('success', () => resolve(get.result), { once: true });
      get.addEventListener('error', () => reject(get.error), { once: true });
    });
    db.close();
    return value;
  }, MAIN_DB);
  expect(stored.releaseVersion).toBe('current-release');
  expect(stored.cfi).toBe('epubcfi(/6/4!/4/2/1:0)');
});

test('@rr8 quota failure aborts the full restore transaction and rolls settings back', async ({ page }) => {
  await page.goto('/library/data');
  await resetMainDb(page, 9);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, appearance: 'light' })), APP_SETTINGS_KEY);
  await page.evaluate((dbName) => {
    const original = IDBObjectStore.prototype.put;
    (IDBObjectStore.prototype as unknown as { put: typeof IDBObjectStore.prototype.put }).put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.transaction.db.name === dbName && this.name === 'progress') throw new DOMException('RR8 quota simulation', 'QuotaExceededError');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  }, MAIN_DB);

  const archive = createLibraryBackupArchive({
    sections: {
      favorites: [{ schemaVersion: 1, workId: 'rr8-atomic-favorite', savedAt: '2026-08-30T10:00:00.000Z' }],
      epubProgress: [{
        schemaVersion: 2,
        workId: 'rr8-atomic-progress',
        edition: 1,
        releaseVersion: '1.0.0',
        cfi: 'epubcfi(/6/2!/4/2/1:0)',
        percentage: 0.2,
        furthestPercentage: 0.2,
        updatedAt: '2026-08-30T10:00:00.000Z',
      }],
    },
    settings: { app: { schemaVersion: 1, appearance: 'dark' } },
  });
  await restoreArchive(page, archive);
  await expect(page.locator('[data-restore-status]')).toHaveAttribute('data-state', 'error');

  const result = await page.evaluate(async ({ dbName, settingKey }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 9);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const favorite = await new Promise<any>((resolve, reject) => {
      const get = db.transaction('favorites', 'readonly').objectStore('favorites').get('rr8-atomic-favorite');
      get.addEventListener('success', () => resolve(get.result), { once: true });
      get.addEventListener('error', () => reject(get.error), { once: true });
    });
    db.close();
    return { favorite, setting: localStorage.getItem(settingKey) };
  }, { dbName: MAIN_DB, settingKey: APP_SETTINGS_KEY });
  expect(result.favorite).toBeUndefined();
  expect(JSON.parse(result.setting ?? '{}')).toEqual({ schemaVersion: 1, appearance: 'light' });
});

test('@rr8 backup includes legacy PDF state without deleting the compatibility database', async ({ page }) => {
  await page.goto('/library/data');
  await resetMainDb(page, 9);
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(dbName);
      deletion.addEventListener('success', () => resolve(), { once: true });
      deletion.addEventListener('error', () => reject(deletion.error), { once: true });
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 1);
      open.addEventListener('upgradeneeded', () => {
        open.result.createObjectStore('progress', { keyPath: 'id' });
        const bookmarks = open.result.createObjectStore('bookmarks', { keyPath: 'id' });
        bookmarks.createIndex('publicationKey', 'publicationKey', { unique: false });
      });
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const identity = { workId: 'rr8-legacy-pdf', edition: 1, releaseVersion: '1.0.0' };
    const publicationKey = 'rr8-legacy-pdf::1::1.0.0';
    const transaction = db.transaction(['progress', 'bookmarks'], 'readwrite');
    transaction.objectStore('progress').put({
      schemaVersion: 1,
      id: publicationKey,
      identity,
      page: 7,
      furthestPage: 9,
      pageCount: 20,
      updatedAt: '2026-08-30T10:00:00.000Z',
    });
    transaction.objectStore('bookmarks').put({
      schemaVersion: 1,
      id: `${publicationKey}::page:7`,
      publicationKey,
      identity,
      page: 7,
      label: 'Page 7',
      createdAt: '2026-08-30T10:00:00.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    db.close();
  }, LEGACY_PDF_DB);

  const backup = await backupJsonFromDownload(page);
  expect(backup.sections.pdfProgress).toContainEqual(expect.objectContaining({ id: 'rr8-legacy-pdf::1::1.0.0', page: 7 }));
  expect(backup.sections.pdfBookmarks).toContainEqual(expect.objectContaining({ page: 7, label: 'Page 7' }));
  const legacyStillExists = await page.evaluate(async (name) => (await indexedDB.databases()).some((database) => database.name === name), LEGACY_PDF_DB);
  expect(legacyStillExists).toBe(true);
});

test('@rr8 personal DB v2 records gain schema v1 without changing private file bytes', async ({ page }) => {
  await page.goto('/library/data');
  await resetMainDb(page, 9);
  await page.evaluate(async (dbName) => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(dbName);
      deletion.addEventListener('success', () => resolve(), { once: true });
      deletion.addEventListener('error', () => reject(deletion.error), { once: true });
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 2);
      open.addEventListener('upgradeneeded', () => open.result.createObjectStore('books', { keyPath: 'id' }));
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const bytes = new TextEncoder().encode('%PDF-1.4\nRR8 PRIVATE BYTES\n%%EOF').buffer;
    const transaction = db.transaction('books', 'readwrite');
    transaction.objectStore('books').put({
      id: 'pdf-' + 'a'.repeat(32),
      format: 'pdf',
      title: 'RR8 Personal v2',
      fileName: 'rr8-personal.pdf',
      mimeType: 'application/pdf',
      size: bytes.byteLength,
      sha256: 'a'.repeat(64),
      importedAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
      file: bytes,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener('complete', () => resolve(), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error), { once: true });
    });
    db.close();
  }, PERSONAL_DB);

  const backup = await backupJsonFromDownload(page);
  expect(backup.sections.personalBooks).toContainEqual(expect.objectContaining({ schemaVersion: 1, title: 'RR8 Personal v2', sha256: 'a'.repeat(64) }));
  expect(JSON.stringify(backup.sections.personalBooks)).not.toContain('RR8 PRIVATE BYTES');

  const stored = await page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(dbName, 3);
      open.addEventListener('success', () => resolve(open.result), { once: true });
      open.addEventListener('error', () => reject(open.error), { once: true });
    });
    const value = await new Promise<any>((resolve, reject) => {
      const get = db.transaction('books', 'readonly').objectStore('books').get('pdf-' + 'a'.repeat(32));
      get.addEventListener('success', () => resolve(get.result), { once: true });
      get.addEventListener('error', () => reject(get.error), { once: true });
    });
    const byteLength = value.file instanceof ArrayBuffer ? value.file.byteLength : await value.file.arrayBuffer().then((buffer: ArrayBuffer) => buffer.byteLength);
    const result = { version: db.version, schemaVersion: value.schemaVersion, byteLength };
    db.close();
    return result;
  }, PERSONAL_DB);
  expect(stored.version).toBe(3);
  expect(stored.schemaVersion).toBe(1);
  expect(stored.byteLength).toBeGreaterThan(20);
});
