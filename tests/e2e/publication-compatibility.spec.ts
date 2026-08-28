import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  PublicationCompatibilityError,
  inspectPublication,
} from '../../src/lib/publication-compatibility';
import {
  activePdfFixture,
  corruptXrefPdfFixture,
  encryptedPdfFixture,
  epub2Fixture,
  epub3RichFixture,
  fixedLayoutFixture,
  imageOnlyPdfFixture,
  incrementalPdfFixture,
  largePagePdfFixture,
  missingNavFixture,
  rejectedEpubFixtures,
  rejectedPdfFixtures,
  rtlVerticalFixture,
  scriptedFixture,
  supportedEpubFixtures,
  supportedPdfFixtures,
  textPdfFixture,
  truncatedPdfFixture,
} from './compatibility-fixtures';
import type { BrowserFixtureFile } from './fixtures';

function exactArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function expectedPersonalTitle(fixture: BrowserFixtureFile): string {
  return fixture.name.replace(/\.(epub|pdf)$/i, '').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function importFixture(page: Page, fixture: BrowserFixtureFile, title: string): Promise<Locator> {
  await page.goto('/library/saved');
  const status = page.locator('[data-personal-import-status]');
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(status).toContainText('1 imported', { timeout: 30_000 });
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toHaveCount(1);
  return card;
}

async function expectRejectedImport(page: Page, fixture: BrowserFixtureFile): Promise<void> {
  const status = page.locator('[data-personal-import-status]');
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(status).toHaveAttribute('data-state', 'error', { timeout: 30_000 });
  await expect(status).toContainText(`${fixture.name}:`);
  await expect(page.locator('[data-personal-book]')).toHaveCount(0);
}

async function openPersonalCard(card: Locator): Promise<void> {
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
}

test('RR3 deterministic corpus has exact preflight dispositions and rejection codes', async () => {
  for (const fixture of supportedEpubFixtures) {
    const report = await inspectPublication(exactArrayBuffer(fixture.buffer), 'epub');
    expect(['supported', 'degraded']).toContain(report.disposition);
    expect(report.features.length).toBeGreaterThan(0);
    expect(report.capabilities.scriptedContent).not.toBe('blocked');
  }
  for (const { fixture, code } of rejectedEpubFixtures) {
    await expect(inspectPublication(exactArrayBuffer(fixture.buffer), 'epub')).rejects.toMatchObject({
      name: 'PublicationCompatibilityError',
      code,
    });
  }
  for (const fixture of supportedPdfFixtures) {
    const report = await inspectPublication(exactArrayBuffer(fixture.buffer), 'pdf');
    expect(report.disposition).toBe('supported');
    expect(report.capabilities.search).toBe('document-dependent');
  }
  for (const { fixture, code } of rejectedPdfFixtures) {
    await expect(inspectPublication(exactArrayBuffer(fixture.buffer), 'pdf')).rejects.toMatchObject({
      name: 'PublicationCompatibilityError',
      code,
    });
  }

  const incremental = await inspectPublication(exactArrayBuffer(incrementalPdfFixture.buffer), 'pdf');
  expect(incremental.features).toContain('incremental-update');
});

test('supported and degraded EPUB classes import and reach the canonical reader', async ({ page }) => {
  const cases: Array<{ fixture: BrowserFixtureFile; title: string; disposition: 'supported' | 'degraded' }> = [
    { fixture: epub3RichFixture, title: 'RR3 Rich EPUB', disposition: 'supported' },
    { fixture: epub2Fixture, title: 'RR3 EPUB 2', disposition: 'supported' },
    { fixture: fixedLayoutFixture, title: 'RR3 Fixed Layout', disposition: 'degraded' },
    { fixture: rtlVerticalFixture, title: 'RR3 RTL Vertical', disposition: 'supported' },
    { fixture: missingNavFixture, title: 'RR3 Missing Navigation', disposition: 'degraded' },
  ];

  for (const item of cases) {
    const card = await importFixture(page, item.fixture, item.title);
    await openPersonalCard(card);
    await expect(page).toHaveURL(/\/library\/personal\/read\?id=/);
    const shell = page.locator('[data-reader-shell]');
    await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
    await expect(shell).toHaveAttribute('data-epub-compatibility', item.disposition);
    await expect(page.locator('[data-reader-title]')).toHaveText(item.title);
  }
});

test('scripted EPUB content remains inert while the publication still opens', async ({ page }) => {
  await page.addInitScript(() => { (window as Window & { __rr3ScriptRan?: boolean }).__rr3ScriptRan = false; });
  const card = await importFixture(page, scriptedFixture, 'RR3 Scripted Attempt');
  await openPersonalCard(card);
  const shell = page.locator('[data-reader-shell]');
  await expect(shell).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
  await expect(shell).toHaveAttribute('data-epub-scripted-content', 'disabled');
  expect(await page.evaluate(() => (window as Window & { __rr3ScriptRan?: boolean }).__rr3ScriptRan)).toBe(false);
});

test('hostile and structurally unsupported EPUBs fail before persistence or network access', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) remoteRequests.push(request.url());
  });
  await page.goto('/library/saved');
  for (const { fixture } of rejectedEpubFixtures) await expectRejectedImport(page, fixture);
  expect(remoteRequests).toEqual([]);
});

test('text, image-only, rotated/mixed-size, and large-page PDFs open with accurate capabilities', async ({ page }) => {
  const textCard = await importFixture(page, textPdfFixture, expectedPersonalTitle(textPdfFixture));
  await openPersonalCard(textCard);
  let root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(root).toHaveAttribute('data-pdf-compatibility', 'supported');
  await expect(page.locator('[data-pdf-page-count]')).toHaveText('2');
  await expect(root).toHaveAttribute('data-pdf-page-text', 'available');
  await page.locator('[data-pdf-next]').click();
  await expect(page.locator('[data-pdf-page-input]')).toHaveValue('2');

  const imageCard = await importFixture(page, imageOnlyPdfFixture, expectedPersonalTitle(imageOnlyPdfFixture));
  await openPersonalCard(imageCard);
  root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  await expect(root).toHaveAttribute('data-pdf-page-text', 'unavailable');
  await page.locator('[data-pdf-search-toggle]').click();
  await expect(page.locator('[data-pdf-search-status]')).toContainText(/no searchable text/i);
  await expect(page.locator('[data-pdf-text-layer]')).toHaveAttribute('aria-label', /no selectable text/i);

  const largeCard = await importFixture(page, largePagePdfFixture, expectedPersonalTitle(largePagePdfFixture));
  await openPersonalCard(largeCard);
  root = page.locator('[data-pdf-reader-root]');
  await expect(root).toHaveAttribute('data-pdf-reader-state', 'ready', { timeout: 30_000 });
  const canvasBox = await page.locator('[data-pdf-canvas]').boundingBox();
  const viewport = page.viewportSize();
  expect(canvasBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (canvasBox && viewport) expect(canvasBox.width).toBeLessThanOrEqual(viewport.width + 1);
});

test('encrypted, active-content, and truncated PDFs are rejected before persistence', async ({ page }) => {
  await page.goto('/library/saved');
  for (const fixture of [encryptedPdfFixture, activePdfFixture, truncatedPdfFixture]) {
    await expectRejectedImport(page, fixture);
  }
});

test('corrupt-xref and incremental PDFs resolve to ready or bounded error without hanging', async ({ page }) => {
  for (const fixture of [corruptXrefPdfFixture, incrementalPdfFixture]) {
    const card = await importFixture(page, fixture, expectedPersonalTitle(fixture));
    await openPersonalCard(card);
    const root = page.locator('[data-pdf-reader-root]');
    await expect.poll(async () => root.getAttribute('data-pdf-reader-state'), { timeout: 30_000 })
      .toMatch(/^(ready|error)$/);
    const state = await root.getAttribute('data-pdf-reader-state');
    if (state === 'error') {
      await expect(page.locator('[data-pdf-error]')).toBeVisible();
      await expect(page.locator('[data-pdf-error-message]')).toHaveText(/.+/);
    }
  }
});

test('compatibility errors retain stable typed identity', () => {
  const error = new PublicationCompatibilityError('pdf-encrypted', 'Encrypted PDF');
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('pdf-encrypted');
  expect(error.disposition).toBe('unsupported');
});
