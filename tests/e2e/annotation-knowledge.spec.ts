import { expect, test, type Locator, type Page } from '@playwright/test';
import { textPdfFixture } from './compatibility-fixtures';

async function openAnnotatedPdfFixture(page: Page): Promise<{ root: Locator; textLayer: Locator }> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(textPdfFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });

  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: 'rr3 text mixed pages', exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();

  const root = page.locator('[data-pdf-reader-root]');
  const textLayer = page.locator('[data-pdf-text-layer]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(textLayer.locator('span').first()).toBeVisible();
  return { root, textLayer };
}

async function selectFirstPdfText(textLayer: Locator): Promise<void> {
  await textLayer.locator('span').first().evaluate((span) => {
    const textNode = [...span.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
    if (!textNode?.textContent) throw new Error('PDF text span has no selectable text node');
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, Math.min(textNode.textContent.length, 18));
    selection?.removeAllRanges();
    selection?.addRange(range);
    span.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });
}

test('@p2 PDF highlight persists, enters the knowledge center, and deep-links back to its page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'P2 annotation workflow is qualified once in canonical Chromium.');

  const { root, textLayer } = await openAnnotatedPdfFixture(page);
  await selectFirstPdfText(textLayer);

  const selectionActions = page.locator('[data-pdf-selection-actions]');
  await expect(selectionActions).toBeVisible();
  await expect(page.locator('[data-pdf-selection-quote]')).not.toBeEmpty();
  await page.locator('[data-pdf-selection-highlight]').click();

  await expect(page.locator('.pdf-reader__annotation-mark')).toHaveCount(1);
  await page.locator('[data-pdf-annotation-toggle]').click();
  await expect(page.locator('[data-pdf-annotation-panel]')).toBeVisible();
  await expect(page.locator('.pdf-reader__annotation-result')).toHaveCount(1);
  await expect(page.locator('[data-pdf-annotation-status]')).toContainText('1 annotation');

  await page.reload();
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('.pdf-reader__annotation-mark')).toHaveCount(1);

  await page.goto('/library/annotations');
  const card = page.locator('.annotation-card');
  await expect(page.locator('[data-annotation-count]')).toContainText('1 annotation');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading', { level: 2 })).toHaveText('rr3 text mixed pages');
  await expect(card.locator('blockquote')).not.toBeEmpty();

  await card.getByRole('button', { name: 'Add note' }).click();
  await card.getByRole('textbox', { name: /Note for rr3 text mixed pages/ }).fill('P2 study insight');
  await card.getByRole('button', { name: 'Save note' }).click();
  await expect(card.locator('.annotation-card__note')).toHaveText('P2 study insight');

  const search = page.locator('[data-annotation-search]');
  await search.fill('study insight');
  await expect(card).toHaveCount(1);
  await search.fill('not-present-anywhere');
  await expect(page.locator('.annotation-card')).toHaveCount(0);
  await expect(page.locator('[data-annotation-empty]')).toBeVisible();
  await search.fill('');
  await expect(page.locator('.annotation-card')).toHaveCount(1);

  const open = page.locator('.annotation-card').getByRole('link', { name: 'Open in book' });
  const href = await open.getAttribute('href');
  expect(href).toContain('/library/personal/pdf');
  expect(href).toContain('page=1');
  expect(href).toContain('annotation=');
  await open.click();

  await expect(page).toHaveURL(/\/library\/personal\/pdf\?.*page=1.*annotation=/);
  await expect(page.locator('[data-pdf-reader-root]')).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue('1');
  await expect(page.locator('.pdf-reader__annotation-mark')).toHaveCount(1);
});
