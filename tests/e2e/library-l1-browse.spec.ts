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

    const format = page.locator('[data-browse-format]');
    await format.selectOption('pdf');
    const pdfRows = page.locator('[data-browse-work]:visible');
    expect(await pdfRows.count()).toBeGreaterThan(0);
    const formats = await pdfRows.first().locator('.catalog-format-list').innerText();
    expect(formats).toContain('PDF');

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
  await expect(page.locator('.book-detail__primary')).toHaveAttribute('href', homeHref!);
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
