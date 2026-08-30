import { expect, test } from '@playwright/test';

test('@rr7 My Library turns blocked browser storage into an actionable retry state', async ({ page }) => {
  await page.addInitScript(() => {
    const state = globalThis as typeof globalThis & { __rr7BlockIndexedDb?: boolean };
    const prototype = IDBFactory.prototype as IDBFactory & { open: (...args: any[]) => IDBOpenDBRequest };
    const originalOpen = prototype.open;
    state.__rr7BlockIndexedDb = true;
    prototype.open = function (...args: any[]) {
      if (state.__rr7BlockIndexedDb) {
        throw new DOMException('IndexedDB disabled for RR7 acceptance', 'SecurityError');
      }
      return originalOpen.apply(this, args as any);
    };
  });

  await page.goto('/library/saved');

  const failure = page.locator('[data-library-error]');
  await expect(failure).toBeVisible();
  await expect(failure.getByRole('heading', { name: 'My Library couldn’t load.' })).toBeVisible();
  await expect(page.locator('[data-library-error-message]')).toContainText('site-storage or private-browsing restrictions');
  await expect(page.locator('[data-saved-empty]')).toBeHidden();
  await expect(page.locator('[data-saved-count]')).toHaveText('Local library unavailable');

  await page.evaluate(() => {
    const state = globalThis as typeof globalThis & { __rr7BlockIndexedDb?: boolean };
    state.__rr7BlockIndexedDb = false;
  });
  await failure.getByRole('button', { name: 'Try again' }).click();

  await expect(failure).toBeHidden();
  await expect(page.locator('[data-saved-count]')).toHaveText('0 books');
  await expect(page.locator('[data-saved-empty]')).toBeVisible();
});
