import { expect, test } from '@playwright/test';

test('B13 guest Library cannot grant Core access or initiate native reconciliation', async ({ page }) => {
  await page.goto('/library/account');
  await expect(page.locator('[data-account-signed-out]')).toBeVisible();
  await expect(page.locator('[data-core-coordinate-section]')).toBeHidden();
  await expect(page.locator('[data-core-coordinate-request]')).toBeHidden();
  await page.evaluate(() => {
    localStorage.setItem(
      'thiepn.library.core-coordination.v1:11111111-1111-4111-8111-111111111111',
      JSON.stringify({
        schemaVersion: 1, ownerId: '11111111-1111-4111-8111-111111111111',
        allowed: true, revision: 1,
      }),
    );
  });
  await page.reload();
  await expect(page.locator('[data-core-coordinate-section]')).toBeHidden();
});
