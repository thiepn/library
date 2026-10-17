import { expect, test, type Page } from '@playwright/test';
import { epubFixture } from './fixtures';
import { textPdfFixture } from './compatibility-fixtures';

async function importReader(page: Page, format: 'epub' | 'pdf') {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(format === 'epub' ? epubFixture : textPdfFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  const title = format === 'epub' ? 'Phase One Test Book' : 'rr3 text mixed pages';
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page.locator(format === 'epub' ? '[data-reader-shell]' : '[data-pdf-reader-root]'))
    .toHaveAttribute(format === 'epub' ? 'data-reader-status' : 'data-pdf-reader-state', 'ready', { timeout: 30_000 });
}

test('L2 EPUB reading guide opens with keyboard and delegates to the original search panel', async ({ page }) => {
  await importReader(page, 'epub');
  const button = page.locator('[data-reading-guide-toggle]');
  await expect(button).toBeVisible();
  await button.click();
  const guide = page.locator('[data-reading-guide]');
  await expect(guide).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await guide.getByRole('button', { name: 'Search book' }).click();
  await expect(guide).toBeHidden();
  await expect(page.locator('[data-reader-search-panel]')).toBeVisible();
  await page.locator('[data-reader-search-close]').click();
  await button.focus();
  await page.keyboard.press('?');
  await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  await expect(button).toBeFocused();
});

test('L2 PDF mobile reading guide opens otherwise hidden saved pages without changing PDF page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await importReader(page, 'pdf');
  const root = page.locator('[data-pdf-reader-root]');
  const currentPage = await page.locator('[data-pdf-page-input]').inputValue();
  const guideToggle = page.locator('[data-reading-guide-toggle]');
  await expect(guideToggle).toBeVisible();
  await guideToggle.click();
  await expect(page.locator('[data-reading-guide]')).toBeVisible();
  await page.locator('[data-reading-guide]').getByRole('button', { name: 'Saved pages' }).click();
  await expect(page.locator('[data-pdf-bookmark-panel]')).toBeVisible();
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue(currentPage);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-pdf-bookmark-panel]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(root).not.toBeNull();
});

test('L2 source-attributed PDF quote copy works for a selection and saved annotation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => {
        (window as unknown as { __l2CopiedQuote?: string }).__l2CopiedQuote = text;
      } },
    });
  });
  await importReader(page, 'pdf');
  const textLayer = page.locator('[data-pdf-text-layer]');
  await expect(textLayer.locator('span').first()).toBeVisible();
  await textLayer.locator('span').first().evaluate((span) => {
    const node = [...span.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (!node?.textContent) throw Error('No selectable PDF text');
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(18, node.textContent.length));
    selection?.removeAllRanges();
    selection?.addRange(range);
    span.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });
  await expect(page.locator('[data-pdf-selection-actions]')).toBeVisible();
  await page.locator('[data-pdf-selection-copy]').click();
  await expect(page.locator('[data-pdf-selection-feedback]')).toContainText('copied');
  const copied = await page.evaluate(() => (window as unknown as { __l2CopiedQuote?: string }).__l2CopiedQuote);
  expect(copied).toContain('rr3 text mixed pages');
  expect(copied).toContain('PDF · page 1 of 2');
  await page.locator('[data-pdf-selection-highlight]').click();
  if (await page.locator('[data-pdf-annotation-toggle]').isVisible()) {
    await page.locator('[data-pdf-annotation-toggle]').click();
  } else {
    await page.locator('[data-reading-guide-toggle]').click();
    await page.locator('[data-reading-guide]').getByRole('button', { name: 'Highlights & notes' }).click();
  }
  await expect(page.locator('.pdf-reader__annotation-result')).toHaveCount(1);
  await page.locator('.pdf-reader__annotation-result').getByRole('button', { name: /Copy PDF highlight on page/ }).click();
  await expect(page.locator('[data-pdf-annotation-status]')).toContainText('copied');
  const copiedAgain = await page.evaluate(() => (window as unknown as { __l2CopiedQuote?: string }).__l2CopiedQuote);
  expect(copiedAgain).toContain('PDF · page 1 of 2');
});
