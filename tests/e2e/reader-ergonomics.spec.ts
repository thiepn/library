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

test('@rr7 settings panels own exposed reading-surface clicks without accidental page turns', async ({ page }) => {
  const shell = await openFixtureReader(page);
  const backdrop = page.locator('[data-reader-panel-backdrop]');
  const appearancePanel = page.locator('[data-reader-appearance-panel]');
  const modePanel = page.locator('[data-reader-mode-panel]');

  const start = await currentCfi(shell);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(shell).toHaveAttribute('data-reader-panel', 'appearance');
  await expect(appearancePanel).toBeVisible();
  await expect(backdrop).toBeVisible();

  await backdrop.click({ position: { x: 18, y: 18 } });
  await expect(appearancePanel).toBeHidden();
  await expect(backdrop).toBeHidden();
  await expect(shell).toHaveAttribute('data-reader-panel', 'none');
  expect(await currentCfi(shell)).toBe(start);

  await page.getByRole('button', { name: 'Reading mode' }).click();
  await expect(modePanel).toBeVisible();
  await expect(shell).toHaveAttribute('data-reader-panel', 'mode');

  // Top-bar settings controls stay available so users can switch panels directly.
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(modePanel).toBeHidden();
  await expect(appearancePanel).toBeVisible();
  await expect(shell).toHaveAttribute('data-reader-panel', 'appearance');

  // Commands outside settings dismiss the floating panel before continuing through
  // the existing single navigation path.
  const beforeNext = await currentCfi(shell);
  await page.locator('footer [data-reader-command="next"]').click();
  await expect(appearancePanel).toBeHidden();
  await expect(backdrop).toBeHidden();
  await expect(shell).toHaveAttribute('data-reader-panel', 'none');
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).not.toBe(beforeNext);
});
