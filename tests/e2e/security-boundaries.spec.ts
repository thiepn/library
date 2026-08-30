import { expect, test, type Page } from '@playwright/test';
import { inspectPublication } from '../../src/lib/publication-compatibility';
import { epub3RichFixture, textPdfFixture } from './compatibility-fixtures';
import type { BrowserFixtureFile } from './fixtures';

interface StoredZipEntry {
  name: string;
  content: Buffer;
}

function exactArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function storedZip(entries: StoredZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;

  for (const source of entries) {
    const name = Buffer.from(source.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(source.content.length, 18);
    local.writeUInt32LE(source.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, source.content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(source.content.length, 20);
    central.writeUInt32LE(source.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + source.content.length;
  }

  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

function container(): Buffer {
  return Buffer.from('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
}

function epubWith(entries: StoredZipEntry[]): ArrayBuffer {
  return exactArrayBuffer(storedZip([
    { name: 'mimetype', content: Buffer.from('application/epub+zip') },
    { name: 'META-INF/container.xml', content: container() },
    ...entries,
  ]));
}

function packageWith(extraManifest = '', extraMetadata = ''): Buffer {
  return Buffer.from(`<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr9</dc:identifier><dc:title>RR9 bounded publication</dc:title><dc:language>en</dc:language>${extraMetadata}</metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>${extraManifest}</manifest><spine><itemref idref="chapter"/></spine></package>`);
}

async function importFixture(page: Page, fixture: BrowserFixtureFile, title: string): Promise<void> {
  await page.goto('/library/saved');
  const status = page.locator('[data-personal-import-status]');
  await page.locator('[data-personal-file-input]').setInputFiles(fixture);
  await expect(status).toContainText('1 imported', { timeout: 30_000 });
  const card = page.locator('[data-personal-book]').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(card).toHaveCount(1);
  await card.getByRole('link', { name: /Start reading|Continue reading|Read again/ }).click();
  await expect(page.locator('[data-reader-shell]')).toHaveAttribute('data-reader-status', 'ready', { timeout: 30_000 });
}

test('live application document ships an enforceable meta CSP and no-referrer policy', async ({ page }) => {
  await page.goto('/library');
  const csp = page.locator('meta[http-equiv="Content-Security-Policy"]');
  await expect(csp).toHaveCount(1);
  const value = await csp.getAttribute('content');
  expect(value).toContain("default-src 'self'");
  expect(value).toContain("object-src 'none'");
  expect(value).toContain("script-src 'self'");
  expect(value).toContain("connect-src 'self' https://media.library.thiepn.dev");
  expect(value).toContain("worker-src 'self' blob:");
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

test('rendered EPUB frame has deny-by-default CSP and cannot make remote fetches', async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) remoteRequests.push(request.url());
  });

  await importFixture(page, epub3RichFixture, 'RR3 Rich EPUB');
  const iframe = page.locator('[data-reader-viewport] iframe').first();
  await expect(iframe).toBeVisible({ timeout: 30_000 });
  const frame = iframe.contentFrame();
  const meta = frame.locator('meta[data-reader-csp="true"]');
  await expect(meta).toHaveCount(1);
  const policy = await meta.getAttribute('content');
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("script-src 'none'");
  expect(policy).toContain("connect-src 'none'");
  expect(policy).toContain('img-src data: blob:');
  expect(policy).toContain("style-src 'unsafe-inline' blob:");

  const outcome = await frame.locator('body').evaluate(async () => {
    try {
      await fetch('https://example.invalid/rr9-runtime-fetch');
      return 'unexpected-success';
    } catch {
      return 'blocked';
    }
  });
  expect(outcome).toBe('blocked');
  expect(remoteRequests).toEqual([]);
});

test('oversized EPUB metadata, covers, and inspectable text are rejected before persistence', async () => {
  const chapter = { name: 'OEBPS/chapter.xhtml', content: Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml"><body>Safe</body></html>') };

  const oversizedPackage = Buffer.concat([
    packageWith(),
    Buffer.alloc(520 * 1024, 0x20),
  ]);
  await expect(inspectPublication(epubWith([
    { name: 'OEBPS/content.opf', content: oversizedPackage },
    chapter,
  ]), 'epub')).rejects.toMatchObject({ code: 'epub-metadata-size-limit', disposition: 'hostile' });

  const coverPackage = packageWith('<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>');
  await expect(inspectPublication(epubWith([
    { name: 'OEBPS/content.opf', content: coverPackage },
    chapter,
    { name: 'OEBPS/cover.png', content: Buffer.alloc(8 * 1024 * 1024 + 1) },
  ]), 'epub')).rejects.toMatchObject({ code: 'epub-cover-size-limit', disposition: 'hostile' });

  const cssPackage = packageWith('<item id="css" href="large.css" media-type="text/css"/>');
  await expect(inspectPublication(epubWith([
    { name: 'OEBPS/content.opf', content: cssPackage },
    chapter,
    { name: 'OEBPS/large.css', content: Buffer.alloc(8 * 1024 * 1024 + 1, 0x20) },
  ]), 'epub')).rejects.toMatchObject({ code: 'epub-inspection-size-limit', disposition: 'hostile' });
});

test('remote srcset/SVG resources and additional PDF active actions are rejected', async () => {
  const remotePackage = packageWith('<item id="svg" href="graphic.svg" media-type="image/svg+xml"/>');
  const remoteSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/pixel.png"/></svg>');
  await expect(inspectPublication(epubWith([
    { name: 'OEBPS/content.opf', content: remotePackage },
    { name: 'OEBPS/chapter.xhtml', content: Buffer.from('<html xmlns="http://www.w3.org/1999/xhtml"><body><img srcset="https://example.invalid/a.png 1x"/></body></html>') },
    { name: 'OEBPS/graphic.svg', content: remoteSvg },
  ]), 'epub')).rejects.toMatchObject({ code: 'epub-remote-resource', disposition: 'hostile' });

  const activePdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction << /S /JavaScript /JS (alert(1)) >> /AA << /S /SubmitForm >> >>\nendobj\n%%EOF\n', 'binary');
  await expect(inspectPublication(exactArrayBuffer(activePdf), 'pdf')).rejects.toMatchObject({
    code: 'pdf-active-content',
    disposition: 'hostile',
  });
});

test('misleading format identity is rejected by actual byte preflight', async () => {
  await expect(inspectPublication(exactArrayBuffer(epub3RichFixture.buffer), 'pdf')).rejects.toMatchObject({ code: 'pdf-header-invalid' });
  await expect(inspectPublication(exactArrayBuffer(textPdfFixture.buffer), 'epub')).rejects.toMatchObject({ code: 'epub-not-zip' });
});
