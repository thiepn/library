import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture, pdfFixture, type BrowserFixtureFile } from './fixtures';

async function importBook(page: Page, fixture: BrowserFixtureFile, title: string): Promise<Locator> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported');
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toBeVisible();
  return card;
}

async function openEpub(page: Page): Promise<Locator> {
  const card = await importBook(page, epubFixture, 'Phase One Test Book');
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-reader-accessibility', 'ready');
  return shell;
}

async function openPdf(page: Page): Promise<Locator> {
  const card = await importBook(page, pdfFixture, 'Phase One PDF Fixture');
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  const root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  return root;
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
}

async function expectMinimumTarget(locator: Locator, minimum: number): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, 'interactive control must have a rendered box').not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
}

test('@rr6 EPUB exposes reader semantics, language, keyboard navigation, and focus recovery', async ({ page }) => {
  const shell = await openEpub(page);
  const viewport = page.locator('[data-reader-viewport]');
  const appearance = page.locator('[data-reader-command="appearance"]');
  const appearancePanel = page.locator('[data-reader-appearance-panel]');
  const previous = page.locator('[data-reader-command="previous"]');
  const next = page.locator('[data-reader-command="next"]');

  await expect(viewport).toHaveAttribute('role', 'region');
  await expect(viewport).toHaveAttribute('aria-label', /Book content/);
  await expect(viewport).toHaveAttribute('aria-keyshortcuts', /ArrowLeft/);
  await expect(page.locator('[data-reader-announcer]')).toHaveAttribute('role', 'status');
  await expect(page.locator('[data-reader-announcer]')).toHaveAttribute('aria-live', 'polite');
  await expect(previous).toHaveAccessibleName('Previous page');
  await expect(next).toHaveAccessibleName('Next page');

  const frame = page.frameLocator('[data-reader-viewport] iframe');
  await expect(page.locator('[data-reader-viewport] iframe')).toHaveAttribute('title', 'Book content: Phase One Test Book');
  await expect(frame.locator('html')).toHaveAttribute('lang', 'en');

  await viewport.focus();
  await expect(viewport).toBeFocused();
  await expect(previous).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(previous).toBeEnabled();
  await page.keyboard.press('ArrowLeft');
  await expect(previous).toBeDisabled();

  await appearance.click();
  await expect(appearance).toHaveAttribute('aria-expanded', 'true');
  await expect(appearancePanel).toHaveAttribute('role', 'dialog');
  await expect(appearancePanel).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(appearancePanel).toBeHidden();
  await expect(appearance).toBeFocused();

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await expect(shell).toHaveAttribute('data-reader-accessibility', 'ready');
});

test('@rr6 PDF exposes named controls, selectable text semantics, and deterministic dialog focus', async ({ page }) => {
  await openPdf(page);
  const viewport = page.locator('[data-pdf-viewport]');
  const search = page.locator('[data-pdf-search-toggle]');
  const searchPanel = page.locator('[data-pdf-search-panel]');
  const searchInput = page.locator('[data-pdf-search-input]');

  await expect(viewport).toHaveAttribute('aria-label', 'PDF page');
  await expect(page.locator('[data-pdf-canvas]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-pdf-text-layer]')).toHaveAttribute('aria-label', 'Selectable PDF text');
  await expect(page.locator('[data-pdf-previous]')).toHaveAccessibleName('Previous page');
  await expect(page.locator('[data-pdf-next]')).toHaveAccessibleName('Next page');
  await expect(page.locator('[data-pdf-page-input]')).toHaveAccessibleName('Page number');
  await expect(page.locator('[data-pdf-fit]')).toHaveAccessibleName('Page fit');

  await search.click();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(searchPanel).toBeVisible();
  await expect(searchPanel).toHaveAttribute('role', 'dialog');
  await expect(searchInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(searchPanel).toBeHidden();
  await expect(search).toBeFocused();

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test('@rr6 400-percent reference reflow keeps core EPUB controls reachable without page overflow', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'The 320 CSS px reference-width audit is sampled once.');
  await page.setViewportSize({ width: 320, height: 720 });
  await openEpub(page);

  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  for (const selector of [
    '[data-reader-command="contents"]',
    '[data-reader-command="appearance"]',
    '[data-reader-command="more"]',
    '[data-reader-command="previous"]',
    '[data-reader-command="next"]',
  ]) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    expect(box.x).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(321);
  }
});

test('@rr6 phone reader controls preserve large touch targets', async ({ page }) => {
  test.skip(!test.info().project.name.endsWith('-phone'), 'Touch target sizing is certified by phone projects.');
  await openEpub(page);
  for (const selector of [
    '[data-reader-command="contents"]',
    '[data-reader-command="appearance"]',
    '[data-reader-command="more"]',
    '[data-reader-command="previous"]',
    '[data-reader-command="next"]',
  ]) await expectMinimumTarget(page.locator(selector), 44);

  await openPdf(page);
  for (const selector of [
    '[data-pdf-search-toggle]',
    '[data-pdf-bookmark-toggle]',
    '[data-pdf-previous]',
    '[data-pdf-next]',
    '[data-pdf-zoom-out]',
    '[data-pdf-zoom-in]',
  ]) await expectMinimumTarget(page.locator(selector), 44);
});

test('@rr6 reduced motion and forced colors become active reader states without hiding focus', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium-desktop', 'Media-preference state is sampled once in Chromium.');
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  const shell = await openEpub(page);
  await expect(shell).toHaveAttribute('data-reader-reduced-motion', 'true');
  await expect(shell).toHaveAttribute('data-reader-forced-colors', 'true');

  const appearance = page.locator('[data-reader-command="appearance"]');
  await appearance.focus();
  const outline = await appearance.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe('none');
});
