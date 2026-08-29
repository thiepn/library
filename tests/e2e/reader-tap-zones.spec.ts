import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture, type BrowserFixtureFile } from './fixtures';
import { largeEpubFixture } from './performance-fixtures';

interface CompatibilityTapResult {
  dispatched: boolean;
  defaultPrevented: boolean;
}

async function importFixture(page: Page, fixture: BrowserFixtureFile, title: string): Promise<void> {
  await page.goto('/library/saved');
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(page.locator('[data-personal-import-status]')).toContainText('1 imported', { timeout: 30_000 });
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-reader-location-cfi', /^epubcfi\(/, { timeout: 10_000 });
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

/**
 * Interact with the reader where the user actually sees it. The EPUB iframe can be many page
 * widths wider than the visible stage, so using iframe.boundingBox().width would reproduce the
 * old test bug rather than a physical tap/click.
 */
async function tapVisibleBook(page: Page, xRatio: number, yRatio = 0.5): Promise<CompatibilityTapResult | null> {
  const viewport = page.locator('[data-reader-viewport]');
  const iframe = page.locator('[data-reader-viewport] iframe');
  const viewportBox = await viewport.boundingBox();
  const iframeBox = await iframe.boundingBox();
  expect(viewportBox, 'Reader viewport must have a rendered box').not.toBeNull();
  expect(iframeBox, 'EPUB iframe must have a rendered box').not.toBeNull();
  if (!viewportBox || !iframeBox) return null;

  const pageX = viewportBox.x + viewportBox.width * xRatio;
  const pageY = viewportBox.y + viewportBox.height * yRatio;

  if (test.info().project.name === 'webkit-phone') {
    // Playwright WebKit does not reliably route touchscreen.tap() through a sandboxed iframe.
    // Dispatch Safari's compatibility click on the exact EPUB Document, but use coordinates
    // derived from the visible outer reader viewport rather than the potentially chapter-wide
    // iframe. Production still performs the normal interaction classification/navigation.
    return page.frameLocator('[data-reader-viewport] iframe').locator('html').evaluate(
      (_html, coordinates) => {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: coordinates.x,
          clientY: coordinates.y,
          button: 0,
        });
        const dispatched = document.dispatchEvent(event);
        return { dispatched, defaultPrevented: event.defaultPrevented };
      },
      { x: pageX - iframeBox.x, y: pageY - iframeBox.y },
    );
  }

  if (test.info().project.name.endsWith('-phone')) {
    await page.touchscreen.tap(pageX, pageY);
  } else {
    await page.mouse.click(pageX, pageY);
  }
  return null;
}

function expectCompatibilityTapHandled(result: CompatibilityTapResult | null): void {
  if (test.info().project.name !== 'webkit-phone') return;
  expect(result, 'WebKit compatibility tap must report its production event outcome').not.toBeNull();
  expect(result?.defaultPrevented, 'EPUB production click listener must consume the compatibility tap').toBe(true);
  expect(result?.dispatched, 'dispatchEvent must return false when the production listener prevents the tap default').toBe(false);
}

async function currentCfi(shell: Locator): Promise<string> {
  const value = await shell.getAttribute('data-reader-location-cfi');
  expect(value).toMatch(/^epubcfi\(/);
  return value ?? '';
}

async function expectCfiChange(shell: Locator, before: string, timeout = 5_000): Promise<string> {
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout }).not.toBe(before);
  return currentCfi(shell);
}

async function advanceByButton(shell: Locator, next: Locator, count: number): Promise<string[]> {
  const locations: string[] = [await currentCfi(shell)];
  for (let index = 0; index < count; index += 1) {
    const before = locations[locations.length - 1]!;
    await expect(next).toBeEnabled();
    await next.click();
    locations.push(await expectCfiChange(shell, before));
  }
  return locations;
}

async function expectNavigationState(previous: Locator, next: Locator, state: 'start' | 'advanced'): Promise<void> {
  if (state === 'start') {
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
  } else {
    await expect(previous).toBeEnabled();
  }
}

test('@rr6 short EPUB uses left previous, center chrome, and right next tap zones', async ({ page }) => {
  test.skip(!test.info().project.name.endsWith('-phone'), 'Basic touchscreen tap zones are certified by phone projects.');

  await importFixture(page, epubFixture, 'Phase One Test Book');
  await expectReaderScriptBoundary(page);
  const shell = page.locator('[data-reader-shell]');
  const previous = page.locator('[data-reader-command="previous"]');
  const next = page.locator('[data-reader-command="next"]');

  await expectNavigationState(previous, next, 'start');
  const startCfi = await currentCfi(shell);

  const rightTap = await tapVisibleBook(page, 0.84);
  expectCompatibilityTapHandled(rightTap);
  const advancedCfi = await expectCfiChange(shell, startCfi);
  await expectNavigationState(previous, next, 'advanced');

  const leftTap = await tapVisibleBook(page, 0.16);
  expectCompatibilityTapHandled(leftTap);
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi')).toBe(startCfi);
  await expectNavigationState(previous, next, 'start');

  const controlsBefore = await shell.getAttribute('data-reader-controls');
  expect(controlsBefore === 'visible' || controlsBefore === 'hidden').toBe(true);
  const expectedAfter = controlsBefore === 'hidden' ? 'visible' : 'hidden';
  const centerTap = await tapVisibleBook(page, 0.5);
  expectCompatibilityTapHandled(centerTap);
  await expect(shell).toHaveAttribute('data-reader-controls', expectedAfter);
  expect(await currentCfi(shell)).toBe(startCfi);
  expect(advancedCfi).not.toBe(startCfi);
});

test('@rr6 multi-page EPUB visible taps preserve reading continuity on desktop and mobile', async ({ page }) => {
  await importFixture(page, largeEpubFixture, 'RR4 Large EPUB');

  const shell = page.locator('[data-reader-shell]');
  const previous = page.locator('[data-reader-command="previous"]');
  const next = page.locator('[data-reader-command="next"]');
  const initialCfi = await currentCfi(shell);

  // Move far enough into a real multi-page EPUB section/book that the iframe can span multiple
  // page widths. This is the state the old two-short-chapter regression never exercised.
  const checkpoints = await advanceByButton(shell, next, 5);
  const deepCfi = checkpoints.at(-1)!;
  expect(deepCfi).not.toBe(initialCfi);
  await expect(previous).toBeEnabled();

  // A right-side visible interaction must advance exactly one rendition step, never walk back
  // toward the cover because of section-global iframe coordinates.
  const rightTap = await tapVisibleBook(page, 0.84);
  expectCompatibilityTapHandled(rightTap);
  const afterRight = await expectCfiChange(shell, deepCfi);
  expect(afterRight).not.toBe(initialCfi);

  // One left-side interaction must undo that one right-side step. This catches duplicate touch /
  // pointer / click page turns as well as the old "everything is previous" classification.
  const leftTap = await tapVisibleBook(page, 0.16);
  expectCompatibilityTapHandled(leftTap);
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).toBe(deepCfi);

  // Center taps are pure UI operations. Toggle chrome repeatedly and prove the exact reading CFI
  // never changes while the UI transitions between visible and hidden states.
  for (let toggle = 0; toggle < 4; toggle += 1) {
    const controlsBefore = await shell.getAttribute('data-reader-controls');
    expect(controlsBefore === 'visible' || controlsBefore === 'hidden').toBe(true);
    const expectedAfter = controlsBefore === 'hidden' ? 'visible' : 'hidden';
    const centerTap = await tapVisibleBook(page, 0.5);
    expectCompatibilityTapHandled(centerTap);
    await expect(shell).toHaveAttribute('data-reader-controls', expectedAfter);
    await page.waitForTimeout(220);
    expect(await currentCfi(shell)).toBe(deepCfi);
  }

  // Keep reading through several more pages. Every right tap must produce a new CFI and must never
  // reset to the initial/cover location. This approximates a short sustained reading sequence.
  let current = deepCfi;
  const forwardLocations: string[] = [];
  for (let turn = 0; turn < 4; turn += 1) {
    const tap = await tapVisibleBook(page, 0.84);
    expectCompatibilityTapHandled(tap);
    current = await expectCfiChange(shell, current);
    expect(current).not.toBe(initialCfi);
    forwardLocations.push(current);
  }
  expect(new Set(forwardLocations).size).toBe(forwardLocations.length);

  // Walk those exact four steps back with left-side taps. The reader must return to the deep
  // checkpoint, not skip pages or collapse to the cover/start.
  for (let turn = forwardLocations.length - 1; turn >= 0; turn -= 1) {
    const expected = turn === 0 ? deepCfi : forwardLocations[turn - 1]!;
    const before = await currentCfi(shell);
    const tap = await tapVisibleBook(page, 0.16);
    expectCompatibilityTapHandled(tap);
    await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).not.toBe(before);
    await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).toBe(expected);
  }

  expect(await currentCfi(shell)).toBe(deepCfi);
  expect(await currentCfi(shell)).not.toBe(initialCfi);
});