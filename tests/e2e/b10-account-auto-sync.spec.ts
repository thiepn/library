import { expect, test } from '@playwright/test';

test('B10 Library hides device auto-sync controls until the original Account user is verified', async ({ page }) => {
  await page.goto('/library/account');
  await expect(page.locator('[data-account-signed-out]')).toBeVisible();
  await expect(page.locator('[data-auto-sync-section]')).toBeHidden();
  const otherOwner = '22222222-2222-4222-8222-222222222222';
  await page.evaluate((owner) => {
    localStorage.setItem('thiepn.library.auto-sync.v1:' + owner,
      JSON.stringify({ version: 1, ownerId: owner, enabled: true }));
  }, otherOwner);
  await page.reload();
  await expect(page.locator('[data-auto-sync-checkbox]')).toBeHidden();
  await expect(page.locator('[data-account-signed-out]')).toBeVisible();
});
