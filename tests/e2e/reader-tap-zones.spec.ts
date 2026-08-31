import { expect, test, type Locator, type Page } from '@playwright/test';
import { epubFixture, type BrowserFixtureFile } from './fixtures';
import { largeEpubFixture } from './performance-fixtures';

interface CompatibilityTapResult {
  dispatched: boolean;
  defaultPrevented: boolean;
  interactiveTarget: boolean;
  targetDescription: string;
}

interface VisibleTapPoint {
  pageX: number;
  pageY: number;
  frameX: number;
  frameY: number;
  targetDescription: string;
}

const USE_STAGED_HOSTED_MEDIA = process.env.RR6_STAGED_HOSTED_MEDIA === '1';
const HOSTED_READER_PATH = '/library/works/ai-for-the-kingdom/read';
const HOSTED_EPUB_ROUTE = '**/library/media/works/ai-for-the-kingdom/editions/1.0.0-rc4/AI_for_the_Kingdom.epub';
const PUBLICATION_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  'details',
  'audio',
  'video',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[data-no-reader-nav]',
].join(',');
const SAFE_TAP_Y_RATIOS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.12, 0.88];

async function waitForReader(page: Page): Promise<Locator> {
  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-reader-location-cfi', /^epubcfi\(/, { timeout: 10_000 });
  await expect(page.locator('[data-reader-viewport] iframe')).toBeVisible();
  return shell;
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
  await waitForReader(page);
}

async function openHostedReader(page: Page): Promise<void> {
  let fixtureRequests = 0;
  if (!USE_STAGED_HOSTED_MEDIA) {
    await page.route(HOSTED_EPUB_ROUTE, async (route) => {
      fixtureRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: largeEpubFixture.mimeType,
        body: largeEpubFixture.buffer,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    });
  }

  await page.goto(HOSTED_READER_PATH);
  await waitForReader(page);

  if (!USE_STAGED_HOSTED_MEDIA) {
    expect(fixtureRequests, 'Hosted route must request the publication EPUB through its real media URL').toBeGreaterThan(0);
  }
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

async function resolveVisibleTapPoint(page: Page, xRatio: number, preferredYRatio = 0.5): Promise<VisibleTapPoint> {
  const viewport = page.locator('[data-reader-viewport]');
  const iframe = page.locator('[data-reader-viewport] iframe');
  const viewportBox = await viewport.boundingBox();
  const iframeBox = await iframe.boundingBox();
  expect(viewportBox, 'Reader viewport must have a rendered box').not.toBeNull();
  expect(iframeBox, 'EPUB iframe must have a rendered box').not.toBeNull();
  if (!viewportBox || !iframeBox) throw new Error('Reader viewport geometry is unavailable.');

  const pageX = viewportBox.x + viewportBox.width * xRatio;
  const candidates = [preferredYRatio, ...SAFE_TAP_Y_RATIOS.filter((ratio) => ratio !== preferredYRatio)];
  const inspected: string[] = [];

  for (const yRatio of candidates) {
    const pageY = viewportBox.y + viewportBox.height * yRatio;
    const frameX = pageX - iframeBox.x;
    const frameY = pageY - iframeBox.y;
    const target = await page.frameLocator('[data-reader-viewport] iframe').locator('html').evaluate(
      (_html, input) => {
        const element = document.elementFromPoint(input.x, input.y) ?? document.documentElement;
        const interactive = Boolean(element.closest(input.interactiveSelector));
        const id = element.id ? `#${element.id}` : '';
        const className = typeof element.className === 'string' && element.className.trim()
          ? `.${element.className.trim().split(/\s+/).join('.')}`
          : '';
        return {
          interactive,
          description: `${element.tagName.toLowerCase()}${id}${className}`,
        };
      },
      { x: frameX, y: frameY, interactiveSelector: PUBLICATION_INTERACTIVE_SELECTOR },
    );
    inspected.push(`${Math.round(yRatio * 100)}%:${target.description}${target.interactive ? ':interactive' : ''}`);
    if (!target.interactive) {
      return { pageX, pageY, frameX, frameY, targetDescription: target.description };
    }
  }

  throw new Error(`No non-interactive publication surface was available in the ${Math.round(xRatio * 100)}% tap zone. Inspected ${inspected.join(', ')}.`);
}

/**
 * Interact with the reader where the user actually sees it. The EPUB iframe can be many page
 * widths wider than the visible stage, so using iframe.boundingBox().width would reproduce the
 * old test bug rather than a physical tap/click. Publication links and controls are never used as
 * tap-zone targets: an interactive target belongs to the publication and must win over reader
 * navigation/chrome gestures.
 */
async function tapVisibleBook(page: Page, xRatio: number, yRatio = 0.5): Promise<CompatibilityTapResult | null> {
  const point = await resolveVisibleTapPoint(page, xRatio, yRatio);

  if (test.info().project.name === 'webkit-phone') {
    // Playwright WebKit does not reliably route page.touchscreen.tap() through EPUB iframes.
    // Model one physical tap inside the exact iframe instead: pointerdown -> pointerup -> the
    // browser compatibility click. This preserves production deduplication semantics without
    // firing unrelated click-only interactions back-to-back inside the same 800 ms gesture window.
    return page.frameLocator('[data-reader-viewport] iframe').locator('html').evaluate(
      (_html, input) => {
        const target = document.elementFromPoint(input.x, input.y) ?? document.documentElement;
        const interactiveTarget = Boolean(target.closest(input.interactiveSelector));
        const pointerInit: PointerEventInit = {
          bubbles: true,
          cancelable: true,
          clientX: input.x,
          clientY: input.y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: 1,
        };
        target.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
        const pointerUp = new PointerEvent('pointerup', { ...pointerInit, buttons: 0 });
        target.dispatchEvent(pointerUp);

        const compatibilityClick = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          clientX: input.x,
          clientY: input.y,
          button: 0,
        });
        const dispatched = target.dispatchEvent(compatibilityClick);
        return {
          dispatched,
          defaultPrevented: pointerUp.defaultPrevented || compatibilityClick.defaultPrevented,
          interactiveTarget,
          targetDescription: input.targetDescription,
        };
      },
      {
        x: point.frameX,
        y: point.frameY,
        interactiveSelector: PUBLICATION_INTERACTIVE_SELECTOR,
        targetDescription: point.targetDescription,
      },
    );
  }

  if (test.info().project.name.endsWith('-phone')) {
    await page.touchscreen.tap(point.pageX, point.pageY);
  } else {
    await page.mouse.click(point.pageX, point.pageY);
  }
  return null;
}

function expectCompatibilityTapHandled(result: CompatibilityTapResult | null): void {
  if (test.info().project.name !== 'webkit-phone') return;
  expect(result, 'WebKit physical-tap fallback must report its production event outcome').not.toBeNull();
  expect(result?.interactiveTarget, `tap-zone probe unexpectedly targeted publication UI: ${result?.targetDescription ?? 'unknown'}`).toBe(false);
  expect(result?.defaultPrevented, 'EPUB production interaction path must consume the physical tap').toBe(true);
  expect(result?.dispatched, 'compatibility click must be consumed after the physical tap').toBe(false);
}

async function currentCfi(shell: Locator): Promise<string> {
  const value = await shell.getAttribute('data-reader-location-cfi');
  expect(value).toMatch(/^epubcfi\(/);
  return value ?? '';
}

async function expectCfiChange(shell: Locator, before: string, settleControl?: Locator, timeout = 5_000): Promise<string> {
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout }).not.toBe(before);
  if (settleControl) await expect(settleControl).toBeEnabled({ timeout });
  return currentCfi(shell);
}

async function advanceByButton(shell: Locator, next: Locator, count: number): Promise<string[]> {
  const locations: string[] = [await currentCfi(shell)];
  for (let index = 0; index < count; index += 1) {
    const before = locations[locations.length - 1]!;
    await expect(next).toBeEnabled();
    await next.click();
    locations.push(await expectCfiChange(shell, before, next));
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

async function expectChromeStable(page: Page, shell: Locator, expected: 'visible' | 'hidden'): Promise<void> {
  await expect(shell).toHaveAttribute('data-reader-controls', expected);
  // The shell has a short pointer-reveal guard after hiding chrome. Re-check after that guard
  // expires so a click/tap cannot appear correct briefly and then flicker the UI back open.
  await page.waitForTimeout(520);
  await expect(shell).toHaveAttribute('data-reader-controls', expected);
}

async function verifyDeepReadingContinuity(page: Page, initialAdvanceCount = 5): Promise<void> {
  const shell = page.locator('[data-reader-shell]');
  const previous = page.locator('[data-reader-command="previous"]');
  const next = page.locator('[data-reader-command="next"]');
  const initialCfi = await currentCfi(shell);

  const checkpoints = await advanceByButton(shell, next, initialAdvanceCount);
  const deepCfi = checkpoints.at(-1)!;
  expect(deepCfi).not.toBe(initialCfi);
  await expect(previous).toBeEnabled();

  const rightTap = await tapVisibleBook(page, 0.84);
  expectCompatibilityTapHandled(rightTap);
  const afterRight = await expectCfiChange(shell, deepCfi, next);
  expect(afterRight).not.toBe(initialCfi);

  const leftTap = await tapVisibleBook(page, 0.16);
  expectCompatibilityTapHandled(leftTap);
  await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).toBe(deepCfi);
  await expect(next).toBeEnabled({ timeout: 5_000 });

  for (let toggle = 0; toggle < 4; toggle += 1) {
    const controlsBefore = await shell.getAttribute('data-reader-controls');
    expect(controlsBefore === 'visible' || controlsBefore === 'hidden').toBe(true);
    const expectedAfter = controlsBefore === 'hidden' ? 'visible' : 'hidden';
    const centerTap = await tapVisibleBook(page, 0.5);
    expectCompatibilityTapHandled(centerTap);
    await expectChromeStable(page, shell, expectedAfter);
    expect(await currentCfi(shell)).toBe(deepCfi);
  }

  let current = deepCfi;
  const forwardLocations: string[] = [];
  for (let turn = 0; turn < 4; turn += 1) {
    const tap = await tapVisibleBook(page, 0.84);
    expectCompatibilityTapHandled(tap);
    current = await expectCfiChange(shell, current, next);
    expect(current).not.toBe(initialCfi);
    forwardLocations.push(current);
  }
  expect(new Set(forwardLocations).size).toBe(forwardLocations.length);

  for (let turn = forwardLocations.length - 1; turn >= 0; turn -= 1) {
    const expected = turn === 0 ? deepCfi : forwardLocations[turn - 1]!;
    const before = await currentCfi(shell);
    const tap = await tapVisibleBook(page, 0.16);
    expectCompatibilityTapHandled(tap);
    await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).not.toBe(before);
    await expect.poll(() => shell.getAttribute('data-reader-location-cfi'), { timeout: 5_000 }).toBe(expected);
    await expect(next).toBeEnabled({ timeout: 5_000 });
  }

  expect(await currentCfi(shell)).toBe(deepCfi);
  expect(await currentCfi(shell)).not.toBe(initialCfi);
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
  await expectChromeStable(page, shell, expectedAfter);
  expect(await currentCfi(shell)).toBe(startCfi);
  expect(advancedCfi).not.toBe(startCfi);
});

test('@rr6 multi-page EPUB visible taps preserve reading continuity on desktop and mobile', async ({ page }) => {
  await importFixture(page, largeEpubFixture, 'RR4 Large EPUB');
  await verifyDeepReadingContinuity(page);
});

test('@rr6 hosted EPUB route preserves reading continuity and stable chrome', async ({ page }) => {
  await openHostedReader(page);
  await expectReaderScriptBoundary(page);
  await verifyDeepReadingContinuity(page, 4);
});
