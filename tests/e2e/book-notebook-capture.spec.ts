import { expect, test } from '@playwright/test';
import { epubFixture } from './fixtures';
import { textPdfFixture } from './compatibility-fixtures';

test('@n1b EPUB notebook capture preserves native CFI and persists a chapter summary', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Canonical N1B EPUB qualification in Chromium.');
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(epubFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  await page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { name: 'Phase One Test Book', level: 3 }),
  }).getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  const startingCfi = await shell.getAttribute('data-reader-location-cfi');
  expect(startingCfi).toMatch(/^epubcfi\(/);

  const trigger = page.locator('[data-book-notebook-toggle]');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const drawer = page.locator('[data-reader-notebook]');
  await expect(drawer).toBeVisible();
  await page.locator('[data-capture-body]').fill('A thought captured without moving the page.');
  await expect(page.locator('[data-capture-status]')).toHaveText('Saved locally', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  expect(await shell.getAttribute('data-reader-location-cfi')).toBe(startingCfi);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator('[data-capture-scope="chapter-summary"]').click();
  await page.locator('[data-capture-body]').fill('Current chapter summary.');
  await expect(page.locator('[data-capture-status]')).toHaveText('Saved locally', { timeout: 10_000 });
  await page.locator('[data-capture-done]').click();
  await trigger.click();
  await page.locator('[data-capture-scope="chapter-summary"]').click();
  await expect(page.locator('[data-capture-body]')).toHaveValue('Current chapter summary.');
  await page.locator('[data-capture-done]').click();
  expect(await shell.getAttribute('data-reader-location-cfi')).toBe(startingCfi);
});

test('@n1b PDF selected quotation creates a page-anchored notebook note without changing page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Canonical PDF selection acceptance in Chromium.');
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(textPdfFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  await page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { name: 'rr3 text mixed pages', level: 3 }),
  }).getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  const first = page.locator('[data-pdf-text-layer] span').first();
  await expect(first).toBeVisible();
  await first.evaluate((span) => {
    const t = [...span.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (!t?.textContent) throw new Error('No selectable PDF text.');
    const s = window.getSelection(), range = document.createRange();
    range.setStart(t, 0); range.setEnd(t, Math.min(18, t.textContent.length));
    s?.removeAllRanges(); s?.addRange(range);
    span.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });
  await expect(page.locator('[data-pdf-selection-notebook]')).toBeVisible();
  await page.locator('[data-pdf-selection-notebook]').click();
  const drawer = page.locator('[data-reader-notebook]');
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-capture-body]')).toHaveValue(/^> /);
  await page.locator('[data-capture-body]').fill('> The selected text\n\nA PDF reflection.');
  await expect(page.locator('[data-capture-status]')).toHaveText('Saved locally', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue('1');
  const records = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('thiepn-library', 11);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('noteDocuments', 'readonly');
    const values = await new Promise<any[]>((resolve, reject) => {
      const r = tx.objectStore('noteDocuments').getAll();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close();
    return values;
  });
  expect(records).toContainEqual(expect.objectContaining({
    scope: 'reading-note', anchor: expect.objectContaining({ format: 'pdf', page: 1 }),
    bodyMarkdown: '> The selected text\n\nA PDF reflection.',
  }));
});


test('@n1b legacy web reader captures chapter-scoped quotation without rewriting progress', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Canonical legacy-web qualification in Chromium.');
  await page.goto('/library/works/how-to-love-god/read/preface');
  const article = page.locator('[data-work-id="how-to-love-god"][data-chapter-id="preface"]');
  await expect(article).toBeVisible();
  await article.locator('.reader-prose p').first().evaluate(paragraph => {
    const t = [...paragraph.childNodes].find(n => n.nodeType === Node.TEXT_NODE);
    if (!t?.textContent) throw new Error('No chapter quotation text');
    const range = document.createRange(), selection = window.getSelection();
    range.setStart(t, 0);
    range.setEnd(t, Math.min(28, t.textContent.length));
    selection?.removeAllRanges(); selection?.addRange(range);
    paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.locator('[data-web-selection-notebook]').click();
  await expect(page.locator('[data-reader-notebook]')).toBeVisible();
  await expect(page.locator('[data-capture-body]')).toHaveValue(/^> /);
  await page.locator('[data-capture-body]').fill('> Quoted chapter text\n\nPersonal reflection');
  await expect(page.locator('[data-capture-status]')).toHaveText('Saved locally', { timeout: 10_000 });
  await page.locator('[data-capture-done]').click();
  await expect(article).toBeVisible();
  const note = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('thiepn-library', 11);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('noteDocuments', 'readonly');
    const notes = await new Promise<any[]>((resolve, reject) => {
      const request = tx.objectStore('noteDocuments').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return notes.find(value => value.workId === 'how-to-love-god');
  });
  expect(note).toMatchObject({
    scope: 'reading-note', anchor: { format: 'web', chapterId: 'preface' },
    bodyMarkdown: '> Quoted chapter text\n\nPersonal reflection',
  });
});
