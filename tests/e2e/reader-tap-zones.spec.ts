import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture } from './fixtures';

interface CompatibilityTapResult {
  dispatched: boolean;
  defaultPrevented: boolean;
}

async function importFixture(page: Page): Promise<void> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(epubFixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported');
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: 'Phase One Test Book', exact: true }),
  });
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();
}

async function expectReaderScriptBoundary(page: Page): Promise<void> {
  const iframe = page.locator('[data-reader-viewport] iframe');
  await expect(iframe).toHaveAttribute('sandbox', /allow-same-origin/);
  await expect(iframe).toHaveAttribute('sandbox', /allow-scripts/);

  const security = await page.frameLocator('[data-reader-viewport] iframe').locator('html').evaluate(async () => {
    const csp = document.querySelector('meta[data-reader-csp="true"]')?.getAttribute('content') ?? '';
    const runtime = window as typeof window & { __rr6PublisherScriptRan?: boolean };
    delete runtime.__rr6PublisherScriptRan;

    const script = document.createElement('script');
    script.textContent = 'window.__rr6PublisherScriptRan = true';
    document.head?.appendChild(script);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const executed = runtime.__rr6PublisherScriptRan === true;
    script.remove();
    delete runtime.__rr6PublisherScriptRan;
    return { csp, executed };
  });

  expect(security.csp).toContain("script-src 'none'");
  expect(security.csp).toContain("object-src 'none'");
  expect(security.executed, 'EPUB CSP must block publisher-style inline script execution').toBe(false);
}

async function tapBook(page: Page, xRatio: number, yRatio = 0.5): Promise<CompatibilityTapResult | null> {
  const iframe = page.locator('[data-reader-viewport] iframe');
  const box = await iframe.boundingBox();
  expect(box, 'EPUB iframe must have a rendered box').not.toBeNull();
  if (!box) return null;

  if (test.info().project.name === 'webkit-phone') {
    // Playwright WebKit does not reliably route page.touchscreen.tap() through an iframe.
    // Safari emits a compatibility click for an unhandled tap. Dispatch that event on the
    // EPUB Document itself because production subscribes there; this avoids depending on
    // Playwright/WebKit synthetic bubbling through application/xhtml+xml elements.
    return page.frameLocator('[data-reader-viewport] iframe').locator('html').evaluate(
      (_html, ratios) => {
        const x = Math.max(1, window.innerWidth) * ratios.x;
        const y = Math.max(1, window.innerHeight) * ratios.y;
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
        });
        const dispatched = document.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
      },
      { x: xRatio, y: yRatio },
    );
  }

  // Chromium keeps the full device-style path: an outer-page touchscreen tap must cross
  // the iframe boundary and reach the production Pointer/Touch interaction handlers.
  await page.touchscreen.tap(
    box.x + box.width * xRatio,
    box.y + box.height * yRatio,
  );
  return null;
}

function expectCompatibilityTapHandled(result: CompatibilityTapResult | null): void {
  if (test.info().project.name !== 'webkit-phone') return;
  expect(result, 'WebKit compatibility tap must report its production event outcome').not.toBeNull();
  expect(result?.defaultPrevented, 'EPUB production click listener must consume the compatibility tap').toBe(true);
  expect(result?.dispatched, 'dispatchEvent must return false when the production listener prevents the tap default').toBe(false);
}

async function expectNavigationState(previous: Locator, next: Locator, state: 'start' | 'advanced'): Promise<void> {
  if (state === 'start') {
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
  } else {
    await expect(previous).toBeEnabled();
  }
}

test('@rr6 mobile EPUB uses left previous, center chrome, and right next tap zones', async ({ page }) => {
  test.skip(!test.info().project.name.endsWith('-phone'), 'Touch tap-zone behavior is certified by the phone projects.');

  await importFixture(page);
  await expectReaderScriptBoundary(page);
  const shell = page.locator('[data-reader-shell]');
  const previous = page.locator('[data-reader-command="previous"]');
  const next = page.locator('[data-reader-command="next"]');

  await expectNavigationState(previous, next, 'start');

  // Right third advances. This is the regression for the mobile bug where every
  // visible tap was normalized into the left/previous zone.
  const rightTap = await tapBook(page, 0.84);
  expectCompatibilityTapHandled(rightTap);
  await expectNavigationState(previous, next, 'advanced');

  // Left third returns to the prior page/location.
  const leftTap = await tapBook(page, 0.16);
  expectCompatibilityTapHandled(leftTap);
  await expectNavigationState(previous, next, 'start');

  // The center third controls chrome instead of turning a page.
  const controlsBefore = await shell.getAttribute('data-reader-controls');
  expect(controlsBefore === 'visible' || controlsBefore === 'hidden').toBe(true);
  const expectedAfter = controlsBefore === 'hidden' ? 'visible' : 'hidden';
  const centerTap = await tapBook(page, 0.5);
  expectCompatibilityTapHandled(centerTap);
  await expect(shell).toHaveAttribute('data-reader-controls', expectedAfter);
  await expectNavigationState(previous, next, 'start');
});
