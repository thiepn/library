import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const WORK = 'ai-for-the-kingdom';
const NOW = '2026-10-12T07:00:00.000Z';
type Format = 'epub' | 'pdf' | 'web';
const docs = [
  {
    id: 'n1d-epub', anchor: { format: 'epub' as Format, edition: 1, releaseVersion: 'r7',
      chapterHref: 'chapter-2.xhtml', chapterLabel: 'Chapter Two', cfi: 'epubcfi(/6/4!/4/2:12)' },
    title: 'N1D EPUB provenance', bodyMarkdown: 'EPUB **idea**.',
    sourceAnnotations: [{ format: 'epub', id: 'selection-from-epub' }],
  },
  {
    id: 'n1d-pdf', anchor: { format: 'pdf' as Format, edition: 2, releaseVersion: 'r2', page: 17 },
    title: 'N1D PDF provenance', bodyMarkdown: 'PDF **idea**.',
    sourceAnnotations: [{ format: 'pdf', id: 'selection-from-pdf' }],
  },
  {
    id: 'n1d-web', anchor: { format: 'web' as Format, chapterId: 'preface' },
    title: 'N1D web provenance', bodyMarkdown: 'Web **idea**.',
    sourceAnnotations: [{ format: 'web', id: 'legacy-selection' }],
  },
].map(item => ({
  schemaVersion: 1, workId: WORK, scope: 'reading-note', revision: 1,
  createdAt: NOW, updatedAt: NOW, ...item,
}));

function envelope() {
  return {
    format: 'thiepn-library-backup',
    schemaVersion: 2,
    exportedAt: NOW,
    state: { main: { schemaVersion: 1, noteDocuments: { schemaVersion: 1, records: docs } } },
  };
}

async function importBackup(page: import('@playwright/test').Page, value: unknown, label: string) {
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: label + '.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');
}

async function records(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['noteDocuments', 'progress'], 'readonly');
    const getAll = (name: string) => new Promise<any[]>((resolve, reject) => {
      const result = tx.objectStore(name).getAll();
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    });
    const result = await Promise.all([getAll('noteDocuments'), getAll('progress')]);
    db.close();
    return { notes: result[0], progress: result[1] };
  });
}

test('@n1d cross-engine V2 three-format provenance, export, V1 preservation, lossless recovery', async ({ page }) => {
  await page.goto('/library/backup');
  await importBackup(page, envelope(), 'n1d-v2');
  const initial = await records(page);
  expect(initial.notes).toHaveLength(3);
  for (const item of docs) {
    expect(initial.notes).toContainEqual(expect.objectContaining({
      id: item.id, anchor: item.anchor, bodyMarkdown: item.bodyMarkdown,
      sourceAnnotations: item.sourceAnnotations,
    }));
  }

  // Restore into a pre-existing browser with native EPUB progress; a partial backup must preserve it.
  await page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('progress', 'readwrite');
    tx.objectStore('progress').put({
      schemaVersion: 2, workId: 'unrelated-reader-progress', edition: 1,
      releaseVersion: 'original-release', cfi: 'epubcfi(/6/2!/4/2:4)',
      percentage: 0.25, furthestPercentage: 0.61, updatedAt: '2026-10-12T07:02:00.000Z',
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });

  await page.goto('/library/notebook?work=' + WORK);
  await expect(page.locator('[data-notebook-count]')).toContainText('3 notebook notes');
  const [markdownDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-notebook-export]').click(),
  ]);
  const markdown = await readFile(await markdownDownload.path(), 'utf8');
  for (const item of docs) {
    expect(markdown).toContain(item.id);
    expect(markdown).toContain(item.bodyMarkdown);
  }
  expect(markdown).toContain('CFI: epubcfi(/6/4!/4/2:12)');
  expect(markdown).toContain('PDF page: 17');
  expect(markdown).toContain('Web chapter: preface');
  expect(markdown).toContain('selection-from-epub');

  await page.goto('/library/backup');
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-library-backup-export]').click(),
  ]);
  const exported = JSON.parse(await readFile(await jsonDownload.path(), 'utf8'));
  expect(exported.schemaVersion).toBe(2);
  expect(exported.state.main.noteDocuments.records).toHaveLength(3);
  expect(exported.state.main.epubProgress.records).toHaveLength(1);

  await page.evaluate(async () => {
    const request = indexedDB.open('thiepn-library', 11);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('noteDocuments', 'readwrite');
    tx.objectStore('noteDocuments').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await importBackup(page, exported, 'n1d-roundtrip');
  const afterRoundTrip = await records(page);
  expect(afterRoundTrip.notes).toHaveLength(3);
  expect(afterRoundTrip.progress).toHaveLength(1);
  expect(afterRoundTrip.progress[0].cfi).toBe('epubcfi(/6/2!/4/2:4)');

  const legacyV1 = {
    format: 'thiepn-library-backup', schemaVersion: 1, exportedAt: NOW,
    state: { main: { schemaVersion: 1, favorites: { schemaVersion: 1, records: [] } } },
  };
  await importBackup(page, legacyV1, 'n1d-legacy-v1');
  const afterV1 = await records(page);
  expect(afterV1.notes).toEqual(afterRoundTrip.notes);
  expect(afterV1.progress).toEqual(afterRoundTrip.progress);
});

test('@n1d cross-engine draft download remains usable when IndexedDB update aborts', async ({ page }) => {
  await page.goto('/library/backup');
  await importBackup(page, envelope(), 'n1d-v2-recovery');
  await page.goto('/library/notebook?work=' + WORK + '&note=n1d-epub');
  await expect(page.locator('[data-notebook-title]')).toHaveValue('N1D EPUB provenance');
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: any, key?: IDBValidKey) {
      if (this.name === 'noteDocuments') throw new Error('N1D_SYNTHETIC_STORAGE_DENIED');
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    } as typeof IDBObjectStore.prototype.put;
  });
  const unsaved = 'Changed while storage is unavailable — 한글 and 中文.';
  await page.locator('[data-notebook-body]').fill(unsaved);
  await expect(page.locator('[data-notebook-save-status]')).toContainText('N1D_SYNTHETIC_STORAGE_DENIED', { timeout: 10000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.locator('[data-notebook-recover]').click(),
  ]);
  const markdown = await readFile(await download.path(), 'utf8');
  expect(markdown).toContain('thiepn_recovery_draft: true');
  expect(markdown).toContain('n1d-epub');
  expect(markdown).toContain('epubcfi');
  expect(markdown).toContain(unsaved);
  const after = await records(page);
  expect(after.notes.find(n => n.id === 'n1d-epub')?.bodyMarkdown).toBe('EPUB **idea**.');
  await page.locator('[data-notebook-close]').click();
  await expect(page.locator('[data-notebook-editor]')).toBeVisible();
  await expect(page.locator('[data-notebook-body]')).toHaveValue(unsaved);
});
