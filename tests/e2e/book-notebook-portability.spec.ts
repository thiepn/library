import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('@n1c notebook V2 backup and Obsidian Markdown round-trip without losing source anchors', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Canonical V2 backup acceptance in Chromium.');
  await page.goto('/library/notebook?work=ai-for-the-kingdom');
  await page.locator('[data-notebook-create="reading-note"]').click();
  await page.locator('[data-notebook-title]').fill('Portable thought');
  await page.locator('[data-notebook-body]').fill('An **original** observation.\n\nSee chapter 2.');
  await expect(page.locator('[data-notebook-save-status]')).toHaveText('Saved locally', { timeout: 10000 });
  await page.locator('[data-notebook-close]').click();

  const [markdownDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-notebook-export]').click(),
  ]);
  const markdown = await readFile(await markdownDownload.path(), 'utf8');
  expect(markdown).toContain('thiepn_export: book-notebook-v1');
  expect(markdown).toContain('**Note ID:**');
  expect(markdown).toContain('An **original** observation.');

  await page.goto('/library/backup');
  const [backupDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-library-backup-export]').click(),
  ]);
  const raw = await readFile(await backupDownload.path(), 'utf8');
  const backup = JSON.parse(raw);
  expect(backup.schemaVersion).toBe(2);
  expect(backup.state.main.noteDocuments.records).toHaveLength(1);
  const document = backup.state.main.noteDocuments.records[0];
  expect(document).toMatchObject({
    scope: 'reading-note', title: 'Portable thought', workId: 'ai-for-the-kingdom',
    bodyMarkdown: 'An **original** observation.\n\nSee chapter 2.',
  });

  await page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('noteDocuments', 'readwrite');
    tx.objectStore('noteDocuments').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  page.once('dialog', d => d.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'notebook-v2.json', mimeType: 'application/json', buffer: Buffer.from(raw),
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');
  await page.goto('/library/notebook?work=ai-for-the-kingdom');
  await expect(page.locator('[data-notebook-count]')).toContainText('1 notebook note');
  await page.getByRole('button', { name: 'Edit Portable thought' }).click();
  await expect(page.locator('[data-notebook-body]')).toHaveValue('An **original** observation.\n\nSee chapter 2.');

  // Old V1 archives must not implicitly clear V2-only notebook documents.
  await page.goto('/library/backup');
  const legacy = { ...backup, schemaVersion: 1, state: { ...backup.state, main: { schemaVersion: 1,
    favorites: backup.state.main.favorites } } };
  page.once('dialog', d => d.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'legacy-v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');
  await page.goto('/library/notebook?work=ai-for-the-kingdom');
  await expect(page.locator('[data-notebook-count]')).toContainText('1 notebook note');
});

test('@n1c rejects duplicate notebook identities before any restore mutation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'N1C prevalidation qualification in Chromium.');
  await page.goto('/library/backup');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-library-backup-export]').click(),
  ]);
  const base = JSON.parse(await readFile(await download.path(), 'utf8'));
  const now = new Date().toISOString();
  const note = {
    schemaVersion: 1, id: 'duplicate-test', workId: 'test-work', scope: 'reading-note',
    title: 'Duplicate', bodyMarkdown: 'Do not restore', sourceAnnotations: [],
    createdAt: now, updatedAt: now, revision: 1,
  };
  base.state.main.noteDocuments.records = [note, { ...note, bodyMarkdown: 'conflict' }];
  page.once('dialog', d => d.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'invalid-v2.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(base)),
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Duplicate notebook document identity');
  // No duplicate or partial record was stored.
  const count = await page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('noteDocuments', 'readonly');
      const q = tx.objectStore('noteDocuments').count();
      q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
    });
    db.close();
    return value;
  });
  expect(count).toBe(0);
});


test('@n1c aborts notebook and favorite writes together after an injected notebook put failure', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Transactional rollback acceptance in Chromium.');
  await page.goto('/library/backup');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-library-backup-export]').click(),
  ]);
  const target = JSON.parse(await readFile(await download.path(), 'utf8'));
  const now = new Date().toISOString();
  target.state.main.favorites.records = [{ schemaVersion: 1, workId: 'must-not-commit', savedAt: now }];
  target.state.main.noteDocuments.records = [{
    schemaVersion: 1, id: 'must-not-commit-note', workId: 'test-work', scope: 'reading-note',
    title: 'Should be rolled back', bodyMarkdown: 'Never committed', sourceAnnotations: [],
    createdAt: now, updatedAt: now, revision: 1,
  }];

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let once = true;
    IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: any, key?: IDBValidKey) {
      if (this.name === 'noteDocuments' && once) {
        once = false;
        throw new Error('N1C_SYNTHETIC_NOTE_WRITE_FAILURE');
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  });

  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'synthetic-failure.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(target)),
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('previous state was restored');
  const state = await page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['favorites', 'noteDocuments'], 'readonly');
    const all = (name: string) => new Promise<any[]>((resolve, reject) => {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const [favorites, notes] = await Promise.all([all('favorites'), all('noteDocuments')]);
    db.close();
    return { favorites, notes };
  });
  expect(state.favorites).not.toContainEqual(expect.objectContaining({ workId: 'must-not-commit' }));
  expect(state.notes).not.toContainEqual(expect.objectContaining({ id: 'must-not-commit-note' }));
});
