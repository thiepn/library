import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { textPdfFixture } from './compatibility-fixtures';

async function importFixture(page: Page): Promise<void> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(textPdfFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 3, name: 'rr3 text mixed pages', exact: true })).toBeVisible();
}

async function editBook(page: Page, title: string, shelves: string, tags: string): Promise<void> {
  const card = page.locator('[data-personal-book]').first();
  await card.getByRole('button', { name: 'Organize' }).click();
  const dialog = page.locator('[data-personal-metadata-dialog]');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Author / creator').fill('Library QA');
  await dialog.getByLabel('Language').fill('English');
  await dialog.getByLabel('Shelves').fill(shelves);
  await dialog.getByLabel('Tags').fill(tags);
  await dialog.getByRole('button', { name: 'Save details' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: title, exact: true })).toBeVisible();
}

test('@p3 personal organization persists, filters, restores, and participates in unified search', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'P3 organization workflow is qualified once in canonical Chromium.');

  await importFixture(page);
  await editBook(page, 'Probability Research PDF', 'Semester 3, Reference', 'stochastik, exam');

  const book = page.locator('[data-personal-book]').first();
  await expect(book.getByRole('button', { name: 'Filter by shelf Semester 3' })).toBeVisible();
  await expect(book.getByRole('button', { name: 'Filter by tag stochastik' })).toBeVisible();

  await page.locator('[data-personal-search]').fill('stochastik');
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);
  await page.locator('[data-personal-search]').fill('no-match-p3');
  await expect(page.locator('[data-personal-book]')).toHaveCount(0);
  await expect(page.locator('[data-personal-books-empty]')).toBeVisible();
  await page.locator('[data-personal-clear]').click();

  await page.locator('[data-personal-shelf]').selectOption({ label: 'Reference' });
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);
  await page.locator('[data-personal-tag]').selectOption({ label: 'exam' });
  await expect(page.locator('[data-personal-book]')).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole('heading', { level: 3, name: 'Probability Research PDF', exact: true })).toBeVisible();
  await expect(page.locator('[data-personal-shelf]').locator('option', { hasText: 'Semester 3' })).toHaveCount(1);

  await page.goto('/library/search?q=stochastik');
  const personalResult = page.locator('[data-search-personal]');
  await expect(personalResult).toHaveCount(1);
  await expect(personalResult.getByRole('link', { name: 'Probability Research PDF' })).toBeVisible();
  await expect(personalResult).toContainText('Shelf: Semester 3');
  await expect(personalResult).toContainText('#stochastik');

  await page.goto('/library/backup');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-library-backup-export]').click(),
  ]);
  const backupPath = await download.path();
  if (!backupPath) throw new Error('P3 backup download did not produce a local file.');
  const backup = await readFile(backupPath);

  await page.goto('/library/saved');
  await editBook(page, 'Temporary Local Title', 'Temporary', 'temporary');
  await expect(page.getByRole('heading', { level: 3, name: 'Temporary Local Title', exact: true })).toBeVisible();

  await page.goto('/library/backup');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-library-backup-input]').setInputFiles({
    name: 'p3-personal-organization-backup.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect(page.locator('[data-library-backup-status]')).toContainText('Restore complete');

  await page.goto('/library/saved');
  await expect(page.getByRole('heading', { level: 3, name: 'Probability Research PDF', exact: true })).toBeVisible();
  const restored = page.locator('[data-personal-book]').first();
  await expect(restored.getByRole('button', { name: 'Filter by shelf Reference' })).toBeVisible();
  await expect(restored.getByRole('button', { name: 'Filter by tag exam' })).toBeVisible();
});
