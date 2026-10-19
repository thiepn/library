import { expect, test } from '@playwright/test';

for (const width of [320, 390, 1440]) {
  test('L1 Browse remains usable at ' + width + 'px with source-backed filtering', async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/library/browse');
    await expect(page.getByRole('heading', { name: 'Browse books' })).toBeVisible();
    await expect(page.locator('[data-browse-work]').first()).toBeVisible();
    const startCount = await page.locator('[data-browse-work]').count();
    expect(startCount).toBeGreaterThan(0);

    const search = page.locator('[data-browse-query]');
    await search.fill('nonexistent-l1-search-zzzyx');
    await expect(page.locator('[data-browse-empty]')).toBeVisible();
    await expect(page.locator('[data-browse-work]:visible')).toHaveCount(0);
    await page.locator('[data-browse-reset]').click();
    await expect(page.locator('[data-browse-work]:visible')).toHaveCount(startCount);

    // The published catalog may legitimately have no PDF releases. Select a format
    // actually advertised by a source-backed publication rather than inventing one.
    const format = page.locator('[data-browse-format]');
    const publishedFormat = await page.locator('[data-browse-work]').evaluateAll((cards) => {
      const formats = cards.flatMap((card) => {
        try { return (JSON.parse((card as HTMLElement).dataset.browseRecord ?? '{}').formats ?? []) as string[]; }
        catch { return [] as string[]; }
      });
      return ['epub', 'pdf', 'web'].find((value) => formats.includes(value)) ?? null;
    });
    expect(publishedFormat).not.toBeNull();
    await format.selectOption(publishedFormat!);
    const matchingRows = page.locator('[data-browse-work]:visible');
    expect(await matchingRows.count()).toBeGreaterThan(0);
    const visibleFormats = await matchingRows.first().locator('.catalog-format-list').innerText();
    expect(visibleFormats).toContain(publishedFormat!.toUpperCase() === 'WEB' ? 'Reader' : publishedFormat!.toUpperCase());

    await page.locator('[data-browse-sort]').selectOption('title');
    await expect(page.locator('[data-browse-count]')).toContainText('of ' + startCount + ' books');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('L1 homepage and Browse point available native EPUB books at the same canonical reader', async ({ page }) => {
  await page.goto('/library/');
  const home = page.locator('[data-catalog-work][data-web-readable="true"]').first();
  await expect(home).toBeVisible();
  const workId = await home.getAttribute('data-catalog-work');
  const homeHref = await home.locator('.catalog-primary').getAttribute('href');
  expect(homeHref).toContain('/read');
  await page.goto('/library/browse');
  const browse = page.locator('[data-browse-work="' + workId + '"]');
  await expect(browse).toBeVisible();
  await expect(browse.locator('.catalog-primary')).toHaveAttribute('href', homeHref!);
  const detailHref = await browse.locator('.catalog-cover').getAttribute('href');
  await page.goto(detailHref!);
  const detailReaderHref = await page.locator('.book-detail__primary').getAttribute('href');
  expect(new URL(detailReaderHref!, page.url()).pathname).toBe(new URL(homeHref!, page.url()).pathname);
});

test('L1 reading desk retains original Continue Reading and saved-library boundaries', async ({ page }) => {
  await page.goto('/library/');
  await expect(page.locator('[data-continue-section]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /Browse all books/ })).toBeVisible();
  await page.getByRole('link', { name: /Browse all books/ }).click();
  await expect(page).toHaveURL(/\/library\/browse\/?$/);
  await expect(page.locator('[data-browse-filters]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Library' }).first()).toBeVisible();
});
