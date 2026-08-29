import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture } from './fixtures';

async function openFixtureReader(page: Page): Promise<Locator> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(epubFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });

  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: 'Phase One Test Book', exact: true }),
  });
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();

  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-reader-location-cfi', /^epubcfi\(/, { timeout: 10_000 });
  return shell;
}

async function currentCfi(shell: Locator): Promise<string> {
  const cfi = await shell.getAttribute('data-reader-location-cfi');
  expect(cfi).toMatch(/^epubcfi\(/);
  return cfi ?? '';
}

test('desktop paginated reader exposes reliable edge controls and removes page arrows in scroll mode', async ({ page }) => {
  test.skip(test.info().project.name.endsWith('-phone'), 'Desktop page rails are intentionally hidden on touch-first phone profiles.');

  const shell = await openFixtureReader(page);
  const previousRail = page.locator('[data-reader-page-rail="previous"]');
  const nextRail = page.locator('[data-reader-page-rail="next"]');
  const footerPrevious = page.locator('footer [data-reader-command="previous"]');
  const footerNext = page.locator('footer [data-reader-command="next"]');

  await expect(previousRail).toBeVisible();
  await expect(previousRail).toBeDisabled();
  await expect(nextRail).toBeVisible();
  await expect(nextRail).toBeEnabled();

  const start = await currentCfi(shell);
  await nextRail.click();
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).not.toBe(start);
  await expect(previousRail).toBeEnabled();
  await expect(footerPrevious).toBeEnabled();

  await previousRail.click();
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).toBe(start);
  await expect(previousRail).toBeDisabled();

  await page.getByRole('button', { name: 'Reading mode' }).click();
  await page.getByRole('button', { name: 'Scroll', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reader-flow', 'scrolled');
  await expect(previousRail).toBeHidden();
  await expect(nextRail).toBeHidden();
  await expect(footerPrevious).toBeHidden();
  await expect(footerNext).toBeHidden();

  await page.getByRole('button', { name: 'Pages', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reader-flow', 'paginated');
  await expect(nextRail).toBeVisible();
  await expect(footerNext).toBeVisible();
});
