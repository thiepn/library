import { deflateRawSync } from 'node:zlib';
import type { BrowserFixtureFile } from '../e2e/fixtures';

interface ZipSourceEntry {
  name: string;
  content: string | Buffer;
  method?: 0 | 8;
}

interface EpubFixtureOptions {
  fileName: string;
  title: string;
  identifier: string;
  chapters: number;
  paragraphsPerChapter: number;
  imageCount?: number;
  imageSize?: number;
  finalSearchToken?: string;
}

const CRC_TABLE: number[] = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zip(entries: ZipSourceEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;

  for (const source of entries) {
    const name = Buffer.from(source.name, 'utf8');
    const content = Buffer.isBuffer(source.content) ? source.content : Buffer.from(source.content, 'utf8');
    const method = source.method ?? 8;
    const flags = 0x0800;
    const compressed = method === 0 ? content : deflateRawSync(content, { level: 6 });
    const checksum = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

function containerXml(): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function fixture(name: string, mimeType: string, buffer: Buffer): BrowserFixtureFile {
  return { name, mimeType, buffer };
}

function deterministicToken(seed: number): string {
  let value = seed >>> 0;
  let output = '';
  for (let index = 0; index < 6; index += 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    output += value.toString(36).padStart(7, '0');
  }
  return output;
}

function paragraph(chapter: number, index: number): string {
  const token = deterministicToken(chapter * 1009 + index * 9176 + 41);
  return `Paragraph ${index + 1} in chapter ${chapter + 1} carries deterministic reader performance text ${token}. Grace, truth, language, research, service, and careful stewardship remain searchable.`;
}

function svgFixture(index: number, minimumBytes: number): string {
  const points: string[] = [];
  let pointBytes = 0;
  let seed = index * 7919 + 17;
  while (pointBytes < minimumBytes) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const x = seed % 800;
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const y = seed % 1200;
    const point = `${x},${y}`;
    points.push(point);
    pointBytes += point.length + 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200"><rect width="800" height="1200" fill="#f7f4ed"/><polyline fill="none" stroke="#333" stroke-width="1" points="${points.join(' ')}"/><text x="40" y="80" font-size="42">RR4 image ${index + 1}</text></svg>`;
}

function makeEpub(options: EpubFixtureOptions): BrowserFixtureFile {
  const imageCount = Math.max(0, Math.min(options.chapters, options.imageCount ?? 0));
  const imageSize = Math.max(1024, options.imageSize ?? 48 * 1024);
  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
  ];
  const spine: string[] = [];
  const nav: string[] = [];
  const entries: ZipSourceEntry[] = [];

  for (let index = 0; index < options.chapters; index += 1) {
    const id = `chapter-${index + 1}`;
    const href = `${id}.xhtml`;
    manifest.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    nav.push(`<li><a href="${href}">Chapter ${index + 1}</a></li>`);
    const paragraphs = Array.from({ length: options.paragraphsPerChapter }, (_, paragraphIndex) => `<p>${paragraph(index, paragraphIndex)}</p>`);
    const image = index < imageCount ? `<figure><img src="image-${index + 1}.svg" alt="Deterministic RR4 image ${index + 1}"/><figcaption>Image-heavy fixture ${index + 1}</figcaption></figure>` : '';
    const target = index === options.chapters - 1 && options.finalSearchToken
      ? `<p id="rr4-target">${options.finalSearchToken} appears only in the final spine item.</p>`
      : '';
    entries.push({
      name: `OEBPS/${href}`,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Chapter ${index + 1}</title><link rel="stylesheet" href="style.css"/></head><body><h1>Chapter ${index + 1}</h1>${image}${paragraphs.join('')}${target}</body></html>`,
    });
  }

  for (let index = 0; index < imageCount; index += 1) {
    const id = `image-${index + 1}`;
    manifest.push(`<item id="${id}" href="${id}.svg" media-type="image/svg+xml"/>`);
    entries.push({ name: `OEBPS/${id}.svg`, content: svgFixture(index, imageSize), method: 0 });
  }

  const packageDocument = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${options.identifier}</dc:identifier><dc:title>${options.title}</dc:title><dc:creator>RR4 Performance Corpus</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-08-28T00:00:00Z</meta></metadata><manifest>${manifest.join('')}</manifest><spine>${spine.join('')}</spine></package>`;
  const navigation = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${nav.join('')}</ol></nav></body></html>`;
  const archive = zip([
    { name: 'mimetype', content: 'application/epub+zip', method: 0 },
    { name: 'META-INF/container.xml', content: containerXml() },
    { name: 'OEBPS/content.opf', content: packageDocument },
    { name: 'OEBPS/nav.xhtml', content: navigation },
    { name: 'OEBPS/style.css', content: 'body{font-family:serif} img{display:block;max-width:100%;height:auto} p{margin:0 0 1em} figure{break-inside:avoid}' },
    ...entries,
  ]);
  return fixture(options.fileName, 'application/epub+zip', archive);
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function makeLongPdf(pageCount: number): BrowserFixtureFile {
  const objects = new Map<number, Buffer>();
  const pageIds: number[] = [];
  const fontId = 3;

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const pageId = 4 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const finalToken = pageIndex === pageCount - 1 ? ' RR4-PDF-FINAL-TARGET' : '';
    const lines = Array.from({ length: 14 }, (_, lineIndex) => `RR4 page ${pageIndex + 1} line ${lineIndex + 1} ${deterministicToken(pageIndex * 97 + lineIndex)}${finalToken}`);
    const operators = lines.map((line, lineIndex) => `${lineIndex === 0 ? '' : '0 -28 Td '}(${escapePdfText(line)}) Tj`).join('\n');
    const stream = Buffer.from(`BT /F1 12 Tf 72 740 Td ${operators} ET`, 'utf8');
    objects.set(contentId, Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'utf8'),
      stream,
      Buffer.from('\nendstream', 'utf8'),
    ]));
    const width = pageIndex % 7 === 0 ? 792 : 612;
    const height = pageIndex % 7 === 0 ? 612 : 792;
    const rotate = pageIndex % 11 === 0 ? ' /Rotate 90' : '';
    objects.set(pageId, Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}]${rotate} /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`, 'utf8'));
  }

  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'utf8'));
  objects.set(2, Buffer.from(`<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`, 'utf8'));
  objects.set(fontId, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'utf8'));

  const header = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');
  const chunks: Buffer[] = [header];
  const offsets = new Map<number, number>();
  let offset = header.length;
  const objectCount = 3 + pageCount * 2;
  for (let id = 1; id <= objectCount; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`Missing PDF object ${id}.`);
    const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`, 'utf8'), body, Buffer.from('\nendobj\n', 'utf8')]);
    offsets.set(id, offset);
    chunks.push(object);
    offset += object.length;
  }

  const xrefOffset = offset;
  const xref: string[] = [`xref\n0 ${objectCount + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= objectCount; id += 1) xref.push(`${String(offsets.get(id) ?? 0).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  chunks.push(Buffer.from(xref.join(''), 'utf8'));
  return fixture('rr4-long-180-page.pdf', 'application/pdf', Buffer.concat(chunks));
}

export const RR4_FINAL_EPUB_TOKEN = 'RR4-EPUB-FINAL-TARGET';
export const RR4_FINAL_PDF_TOKEN = 'RR4-PDF-FINAL-TARGET';

export const smallEpubFixture = makeEpub({
  fileName: 'rr4-small.epub',
  title: 'RR4 Small EPUB',
  identifier: 'urn:rr4:small',
  chapters: 4,
  paragraphsPerChapter: 8,
  finalSearchToken: RR4_FINAL_EPUB_TOKEN,
});

export const ordinaryEpubFixture = makeEpub({
  fileName: 'rr4-ordinary.epub',
  title: 'RR4 Ordinary EPUB',
  identifier: 'urn:rr4:ordinary',
  chapters: 36,
  paragraphsPerChapter: 18,
  finalSearchToken: RR4_FINAL_EPUB_TOKEN,
});

export const largeEpubFixture = makeEpub({
  fileName: 'rr4-large.epub',
  title: 'RR4 Large EPUB',
  identifier: 'urn:rr4:large',
  chapters: 180,
  paragraphsPerChapter: 28,
  finalSearchToken: RR4_FINAL_EPUB_TOKEN,
});

export const imageHeavyEpubFixture = makeEpub({
  fileName: 'rr4-image-heavy.epub',
  title: 'RR4 Image Heavy EPUB',
  identifier: 'urn:rr4:image-heavy',
  chapters: 24,
  paragraphsPerChapter: 8,
  imageCount: 24,
  imageSize: 48 * 1024,
  finalSearchToken: RR4_FINAL_EPUB_TOKEN,
});

export const longPdfFixture = makeLongPdf(180);

export const performanceFixtureMetadata = {
  smallEpub: { bytes: smallEpubFixture.buffer.length, spineItems: 4, images: 0 },
  ordinaryEpub: { bytes: ordinaryEpubFixture.buffer.length, spineItems: 36, images: 0 },
  largeEpub: { bytes: largeEpubFixture.buffer.length, spineItems: 180, images: 0 },
  imageHeavyEpub: { bytes: imageHeavyEpubFixture.buffer.length, spineItems: 24, images: 24 },
  longPdf: { bytes: longPdfFixture.buffer.length, pages: 180 },
} as const;
