import { expect, test, type Locator, type Page } from '@playwright/test';
import { textPdfFixture } from './compatibility-fixtures';

async function openTwoPagePdf(page: Page): Promise<{ root: Locator; viewport: Locator }> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(textPdfFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });

  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: 'rr3 text mixed pages', exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();

  const root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-pdf-page-count]')).toHaveText('2');
  await expect(root).not.toHaveAttribute('aria-busy', 'true');
  return { root, viewport: page.locator('[data-pdf-viewport]') };
}

async function expectPage(page: Page, root: Locator, pageNumber: number): Promise<void> {
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue(String(pageNumber));
  await expect(root).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-pdf-status]')).toContainText(`Page ${pageNumber} of 2`);
}

async function expectMobileControlsDoNotOverlap(page: Page): Promise<void> {
  const [zoomBox, progressBox] = await Promise.all([
    page.locator('.pdf-reader__zoom-controls').boundingBox(),
    page.locator('[data-pdf-progress]').boundingBox(),
  ]);
  expect(zoomBox).not.toBeNull();
  expect(progressBox).not.toBeNull();
  expect(zoomBox!.x + zoomBox!.width).toBeLessThanOrEqual(progressBox!.x + 1);
}

async function dispatchSwipe(viewport: Locator, fromX: number, toX: number): Promise<void> {
  await viewport.evaluate((element, input) => {
    const makeTouch = (clientX: number) => ({ identifier: 41, clientX, clientY: 280 });
    const makeTouchList = (items: Array<{ identifier: number; clientX: number; clientY: number }>) => ({
      length: items.length,
      item: (index: number) => items[index] ?? null,
    });
    const dispatch = (
      type: string,
      touches: Array<{ identifier: number; clientX: number; clientY: number }>,
      changedTouches: Array<{ identifier: number; clientX: number; clientY: number }>,
    ) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { configurable: true, value: makeTouchList(touches) },
        changedTouches: { configurable: true, value: makeTouchList(changedTouches) },
      });
      element.dispatchEvent(event);
    };
    const start = makeTouch(input.fromX);
    const end = makeTouch(input.toX);
    dispatch('touchstart', [start], [start]);
    dispatch('touchend', [], [end]);
  }, { fromX, toX });
}

test('@rr7 PDF desktop rails share canonical navigation and clear busy state after page turns', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.endsWith('-phone'), 'Desktop rail acceptance only.');
  const { root } = await openTwoPagePdf(page);
  const previousRail = page.locator('[data-pdf-page-rail-previous]');
  const nextRail = page.locator('[data-pdf-page-rail-next]');

  await expect(previousRail).toBeDisabled();
  await expect(nextRail).toBeEnabled();
  await nextRail.click();
  await expectPage(page, root, 2);
  await expect(nextRail).toBeDisabled();
  await expect(previousRail).toBeEnabled();

  await previousRail.click();
  await expectPage(page, root, 1);
});

test('@rr7 PDF touch swipes turn fitted pages without replacing native zoom panning', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('-phone'), 'Touch-swipe acceptance only.');
  const { root, viewport } = await openTwoPagePdf(page);
  await expectMobileControlsDoNotOverlap(page);

  await dispatchSwipe(viewport, 320, 70);
  await expectPage(page, root, 2);
  await expectMobileControlsDoNotOverlap(page);

  await dispatchSwipe(viewport, 70, 320);
  await expectPage(page, root, 1);

  await page.locator('[data-pdf-zoom-in]').click();
  await expect(page.locator('[data-pdf-fit]')).toHaveValue('custom');
  await dispatchSwipe(viewport, 320, 70);
  await expectPage(page, root, 1);
});
