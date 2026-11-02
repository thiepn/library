import { expect, test } from '@playwright/test';

test('public Library remains readable while Account host is unreachable', async ({ page }) => {
  const accountRequests: string[] = [];
  await page.route('https://account.thiepn.dev/**', async route => {
    accountRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto('/library/');
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.getByRole('link', { name: 'My Library' })).toBeVisible();

  // The optional background sync schedules its first pass at 500ms.
  // Old guest-first code attempted an iframe SSO probe here.
  await page.waitForTimeout(1300);
  expect(accountRequests).toEqual([]);
  expect(page.url()).toMatch(/\/library\/?$/);
});

test('Account page is guest-first and never starts SSO without a click', async ({ page }) => {
  const accountRequests: string[] = [];
  await page.route('https://account.thiepn.dev/**', async route => {
    accountRequests.push(route.request().url());
    await route.abort();
  });

  await page.goto('/library/account/');
  await expect(page.getByRole('heading', { name: 'Keep reading without an account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect THIEPN Account' })).toBeVisible();
  await expect(page.locator('[data-account-summary]')).toContainText('without an account');
  await page.waitForTimeout(1300);
  expect(accountRequests).toEqual([]);
  expect(page.url()).toMatch(/\/library\/account\/?$/);
});

test('failed OAuth callback offers a working guest exit without replaying the code', async ({ page }) => {
  await page.goto('/library/auth/callback/?code=synthetic-failure&state=invalid');
  await expect(page.locator('[data-sso-callback-status]')).toContainText('could not be verified');
  const guest = page.getByRole('link', { name: 'Continue reading without an account' });
  await expect(guest).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to Account and reconnect' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await guest.click();
  await expect(page).toHaveURL(/\/library\/?$/);
  await expect(page.locator('.site-header')).toBeVisible();
});
