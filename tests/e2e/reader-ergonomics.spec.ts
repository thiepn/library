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

test('@rr7 settings panels have discoverable close controls and own exposed reading-surface clicks', async ({ page }) => {
  const shell = await openFixtureReader(page);
  const backdrop = page.locator('[data-reader-panel-backdrop]');
  const appearancePanel = page.locator('[data-reader-appearance-panel]');
  const modePanel = page.locator('[data-reader-mode-panel]');
  const appearanceTrigger = page.locator('[data-reader-command="appearance"]');
  const modeTrigger = page.locator('[data-reader-command="more"]');

  // Canonical reader command markers stay unique. Sheet close controls have their
  // own identity so RR6 focus/reflow/touch-target queries do not become ambiguous.
  await expect(appearanceTrigger).toHaveCount(1);
  await expect(modeTrigger).toHaveCount(1);

  const start = await currentCfi(shell);
  await appearanceTrigger.click();
  await expect(shell).toHaveAttribute('data-reader-panel', 'appearance');
  await expect(appearancePanel).toBeVisible();
  await expect(backdrop).toBeVisible();
  const appearanceClose = appearancePanel.getByRole('button', { name: 'Close reading appearance' });
  await expect(appearanceClose).toBeVisible();
  await appearanceClose.click();
  await expect(appearancePanel).toBeHidden();
  await expect(backdrop).toBeHidden();
  await expect(appearanceTrigger).toBeFocused();
  expect(await currentCfi(shell)).toBe(start);

  // Outside dismissal owns the reading surface, so the same tap cannot leak into
  // EPUB edge navigation behind the open settings panel.
  await appearanceTrigger.click();
  await expect(backdrop).toBeVisible();
  await backdrop.click({ position: { x: 18, y: 18 } });
  await expect(appearancePanel).toBeHidden();
  await expect(backdrop).toBeHidden();
  await expect(shell).toHaveAttribute('data-reader-panel', 'none');
  await expect(appearanceTrigger).toBeFocused();
  expect(await currentCfi(shell)).toBe(start);

  await modeTrigger.click();
  await expect(modePanel).toBeVisible();
  await expect(shell).toHaveAttribute('data-reader-panel', 'mode');
  const modeClose = modePanel.getByRole('button', { name: 'Close reading mode' });
  await expect(modeClose).toBeVisible();
  await modeClose.click();
  await expect(modePanel).toBeHidden();
  await expect(modeTrigger).toBeFocused();
  expect(await currentCfi(shell)).toBe(start);

  await modeTrigger.click();
  // Top-bar settings controls stay available so users can switch panels directly.
  await appearanceTrigger.click();
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
