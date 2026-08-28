import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture, pdfFixture, type BrowserFixtureFile } from './fixtures';

function watchPageErrors(page: Page): () => void {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  return () => expect(errors, `Unhandled browser errors:\n${errors.join('\n\n')}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
  }))).toEqual({ documentOverflow: 0, bodyOverflow: 0 });
}

async function importBook(page: Page, fixture: BrowserFixtureFile, title: string): Promise<Locator> {
  await page.goto('/library/saved');
  await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported');

  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toBeVisible();
  return card;
}

async function expectPrimaryReaderControlsInViewport(page: Page, selectors: string[]): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  for (const selector of selectors) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box, `${selector} must have a rendered box`).not.toBeNull();
    if (!box) continue;
    expect(box.x, `${selector} starts outside the viewport`).toBeGreaterThanOrEqual(-1);
    expect(box.y, `${selector} starts outside the viewport`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${selector} exceeds the viewport width`).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height, `${selector} exceeds the viewport height`).toBeLessThanOrEqual(viewport.height + 1);
  }
}

test('catalog and My Library navigation remain usable and contained', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);

  await page.goto('/library');
  await expect(page).toHaveTitle(/Library/);
  await expect(page.getByRole('heading', { level: 1, name: 'Books' })).toBeVisible();
  await expect(page.getByRole('search')).toBeVisible();
  await expect(page.locator('[data-catalog-work]').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('link', { name: 'My Library' }).first().click();
  await expect(page).toHaveURL(/\/library\/saved\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My Library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose EPUB or PDF' })).toBeVisible();
  await expect(page.locator('[data-personal-drop]')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  assertNoPageErrors();
});

test('personal EPUB import opens the canonical reader with reachable controls', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const card = await importBook(page, epubFixture, 'Phase One Test Book');

  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page).toHaveURL(/\/library\/personal\/read\?id=/);

  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-reader-title]')).toHaveText('Phase One Test Book');
  await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();

  const contents = page.locator('[data-reader-command="contents"]');
  const appearance = page.locator('[data-reader-command="appearance"]');
  const mode = page.locator('[data-reader-command="more"]');
  await expect(contents).toBeEnabled();
  await expect(appearance).toBeEnabled();
  await expect(mode).toBeEnabled();
  await expectPrimaryReaderControlsInViewport(page, [
    '[data-reader-command="contents"]',
    '[data-reader-command="appearance"]',
    '[data-reader-command="more"]',
    '[data-reader-command="previous"]',
    '[data-reader-command="next"]',
  ]);

  await appearance.click();
  await expect(appearance).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-reader-appearance-panel]')).toBeVisible();
  await appearance.click();
  await expect(page.locator('[data-reader-appearance-panel]')).toBeHidden();

  await mode.click();
  await expect(mode).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-reader-mode-panel]')).toBeVisible();
  await mode.click();
  await expect(page.locator('[data-reader-mode-panel]')).toBeHidden();

  await expectNoHorizontalOverflow(page);
  assertNoPageErrors();
});

test('personal PDF import opens the integrated reader and owns dialog focus', async ({ page }) => {
  const assertNoPageErrors = watchPageErrors(page);
  const card = await importBook(page, pdfFixture, 'Phase One PDF Fixture');

  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page).toHaveURL(/\/library\/personal\/pdf\?id=/);

  const root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('.pdf-reader__title')).toHaveText('Phase One PDF Fixture');
  await expect(page.locator('[data-pdf-page-count]')).toHaveText('1');
  await expect(page.locator('[data-pdf-canvas]')).toBeVisible();

  const search = page.locator('[data-pdf-search-toggle]');
  const saved = page.locator('[data-pdf-bookmark-toggle]');
  await expectPrimaryReaderControlsInViewport(page, [
    '[data-pdf-search-toggle]',
    '[data-pdf-bookmark-toggle]',
    '[data-pdf-previous]',
    '[data-pdf-next]',
  ]);

  await search.click();
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-pdf-search-panel]')).toBeVisible();
  await expect(page.locator('[data-pdf-search-input]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pdf-search-panel]')).toBeHidden();
  await expect(search).toBeFocused();

  await saved.click();
  await expect(saved).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-pdf-bookmark-panel]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pdf-bookmark-panel]')).toBeHidden();
  await expect(saved).toBeFocused();

  await expectNoHorizontalOverflow(page);
  assertNoPageErrors();
});
