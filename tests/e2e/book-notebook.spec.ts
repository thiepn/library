import { expect, test } from '@playwright/test';

test('@n1a local book overview, chapter summary and reading note round-trip into Knowledge', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'N1A notebook acceptance on canonical Chromium.');
  await page.goto('/library/notebook?work=ai-for-the-kingdom');
  const root = page.locator('[data-notebook-root]');
  await expect(root).toBeVisible();
  await expect(page.locator('[data-notebook-book]')).toHaveValue('ai-for-the-kingdom');
  await page.getByRole('button', { name: 'Book overview', exact: true }).click();
  await page.locator('[data-notebook-body]').fill('**Primary argument**\n\nMy original overview.');
  await expect(page.locator('[data-notebook-save-status]')).toHaveText('Saved locally');
  await page.locator('[data-notebook-close]').click();
  await page.reload();
  await expect(page.locator('[data-notebook-count]')).toContainText('1 notebook note');
  await page.getByRole('button', { name: 'Edit Book overview' }).click();
  await expect(page.locator('[data-notebook-body]')).toHaveValue(/My original overview/);
  await page.locator('[data-notebook-close]').click();

  await page.locator('[data-notebook-create="chapter-summary"]').click();
  await page.locator('[data-notebook-chapter-key]').fill('Chapter 2');
  await page.getByRole('button', { name: 'Create summary' }).click();
  await page.locator('[data-notebook-body]').fill('Chapter two synthesis');
  await expect(page.locator('[data-notebook-save-status]')).toHaveText('Saved locally');
  await page.locator('[data-notebook-close]').click();

  await page.locator('[data-notebook-create="reading-note"]').click();
  await page.locator('[data-notebook-title]').fill('One reusable insight');
  await page.locator('[data-notebook-body]').fill('A note without a text selection.');
  await expect(page.locator('[data-notebook-save-status]')).toHaveText('Saved locally');
  await page.locator('[data-notebook-close]').click();
  await expect(page.locator('[data-notebook-count]')).toContainText('3 notebook notes');

  await page.goto('/library/knowledge?book=ai-for-the-kingdom');
  await expect(page.locator('[data-knowledge-book]')).toHaveValue('ai-for-the-kingdom');
  await expect(page.locator('.knowledge-card')).toHaveCount(3);
  await expect(page.locator('.knowledge-card').first()).toContainText(/overview|Chapter 2|A note without a text selection/);
  await page.locator('[data-knowledge-format]').selectOption('book');
  await expect(page.locator('.knowledge-card')).toHaveCount(3);
  await page.locator('[data-knowledge-search]').fill('A note without a text selection');
  await expect(page.locator('.knowledge-card')).toHaveCount(1);
  await expect(page.locator('.knowledge-card').first().getByRole('link', { name: 'Edit in notebook' })).toHaveAttribute('href', /notebook\?work=.*&note=/);
});
