import { expect, test } from '@playwright/test';
import { activePdfFixture } from './compatibility-fixtures';
import { rr9SandboxEpubFixture } from './security-fixtures';

test('@rr9 EPUB sandbox strips executable/navigation surfaces and blocks remote subresources', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) remoteRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __rr9ScriptRan?: boolean;
      __rr9EventRan?: boolean;
      __rr9DataRan?: boolean;
      __rr9JavascriptRan?: boolean;
    };
    target.__rr9ScriptRan = false;
    target.__rr9EventRan = false;
    target.__rr9DataRan = false;
    target.__rr9JavascriptRan = false;
  });

  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(rr9SandboxEpubFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });

  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: 'RR9 Sandbox Attack', exact: true }),
  });
  await expect(card).toHaveCount(1);
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();

  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-epub-scripted-content', 'disabled');

  const frame = page.frameLocator('[data-reader-viewport] iframe').first();
  await expect(frame.locator('base')).toHaveCount(0);
  await expect(frame.locator('script')).toHaveCount(0);
  await expect(frame.locator('body')).not.toHaveAttribute('onload', /.+/);
  await expect(frame.locator('#dangerous-link')).not.toHaveAttribute('href', /.+/);
  await expect(frame.locator('#javascript-link')).not.toHaveAttribute('href', /.+/);

  const csp = frame.locator('meta[data-reader-csp="true"]');
  await expect(csp).toHaveCount(1);
  await expect(csp).toHaveAttribute('content', /default-src 'none'/);
  await expect(csp).toHaveAttribute('content', /connect-src 'none'/);
  await expect(csp).toHaveAttribute('content', /base-uri 'none'/);
  await expect(csp).toHaveAttribute('content', /img-src 'self' data: blob:/);

  await expect.poll(async () => frame.locator('#local-image').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const markers = await page.evaluate(() => {
    const target = window as typeof window & {
      __rr9ScriptRan?: boolean;
      __rr9EventRan?: boolean;
      __rr9DataRan?: boolean;
      __rr9JavascriptRan?: boolean;
    };
    return [target.__rr9ScriptRan, target.__rr9EventRan, target.__rr9DataRan, target.__rr9JavascriptRan];
  });
  expect(markers).toEqual([false, false, false, false]);
  expect(remoteRequests).toEqual([]);
});

test('@rr9 active PDF content is rejected before local persistence', async ({ page }) => {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(activePdfFixture);
  const status = page.locator('[data-personal-import-status]');
  await expect(status).toHaveAttribute('data-state', 'error', { timeout: 30_000 });
  await expect(status).toContainText('rr3-active-content.pdf');
  await expect(page.locator('[data-personal-book]')).toHaveCount(0);
});
