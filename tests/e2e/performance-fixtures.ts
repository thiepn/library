import { deflateRawSync } from 'node:zlib';
import type { BrowserFixtureFile } from './fixtures';

interface ZipEntry {
  name: string;
  content: string | Buffer;
  method?: 0 | 8;
}

export const LARGE_EPUB_CHAPTERS = 96;
export const LARGE_PDF_PAGES = 160;

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function zip(entries: ZipEntry[]): Buffer {
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

function epubContainer(): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function buildLargeEpub(): Buffer {
  const chapterIds = Array.from({ length: LARGE_EPUB_CHAPTERS }, (_, index) => `chapter-${index + 1}`);
  const manifest = chapterIds
    .map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('');
  const spine = chapterIds.map((id) => `<itemref idref="${id}"/>`).join('');
  const nav = chapterIds
    .map((id, index) => `<li><a href="${id}.xhtml">Section ${index + 1}</a></li>`)
    .join('');

  const packageDocument = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:rr4-large-epub</dc:identifier>
    <dc:title>RR4 Large EPUB</dc:title>
    <dc:creator>Performance Corpus</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-08-28T00:00:00Z</meta>
  </metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest>
  <spine>${spine}</spine>
</package>`;

  const navDocument = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head><body><nav epub:type="toc"><ol>${nav}</ol></nav></body></html>`;

  const prose = Array.from({ length: 28 }, (_, index) =>
    `<p>Performance paragraph ${index + 1}. This deterministic section exercises reflow, pagination, location tracking, and long-book lifecycle behavior without third-party text.</p>`,
  ).join('');

  const chapters: ZipEntry[] = chapterIds.map((id, index) => ({
    name: `OEBPS/${id}.xhtml`,
    content: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Section ${index + 1}</title></head><body>
<h1>Section ${index + 1}</h1>${prose}${index === LARGE_EPUB_CHAPTERS - 1 ? '<p>RR4 FINAL EPUB PERFORMANCE MARKER</p>' : ''}
</body></html>`,
  }));

  return zip([
    { name: 'mimetype', content: 'application/epub+zip', method: 0 },
    { name: 'META-INF/container.xml', content: epubContainer() },
    { name: 'OEBPS/content.opf', content: packageDocument },
    { name: 'OEBPS/nav.xhtml', content: navDocument },
    ...chapters,
  ]);
}

function pdfEscape(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

function buildPdf(pageCount: number, pageWidth = 612, pageHeight = 792): Buffer {
  const pageIds = Array.from({ length: pageCount }, (_, index) => 4 + index * 2);
  const objectCount = 3 + pageCount * 2;
  const objects = new Map<number, string>();

  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    const marker = pageNumber === pageCount ? ' RR4 FINAL PDF PERFORMANCE MARKER' : '';
    const text = pdfEscape(`RR4 large PDF page ${pageNumber}.${marker}`);
    const stream = `BT /F1 14 Tf 72 ${Math.max(72, pageHeight - 72)} Td (${text}) Tj ET`;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  }

  const header = '%PDF-1.7\n%RR4\n';
  const chunks: string[] = [header];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let cursor = Buffer.byteLength(header, 'latin1');

  for (let id = 1; id <= objectCount; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`Missing generated PDF object ${id}.`);
    const chunk = `${id} 0 obj\n${body}\nendobj\n`;
    offsets[id] = cursor;
    chunks.push(chunk);
    cursor += Buffer.byteLength(chunk, 'latin1');
  }

  const xrefOffset = cursor;
  const xref = [
    `xref\n0 ${objectCount + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
  ].join('');
  const trailer = `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(xref, trailer);
  return Buffer.from(chunks.join(''), 'latin1');
}

function fixture(name: string, mimeType: BrowserFixtureFile['mimeType'], buffer: Buffer): BrowserFixtureFile {
  return { name, mimeType, buffer };
}

export const largeEpubFixture = fixture('rr4-large-epub.epub', 'application/epub+zip', buildLargeEpub());
export const largePdfFixture = fixture('RR4 Large PDF.pdf', 'application/pdf', buildPdf(LARGE_PDF_PAGES));
export const oversizedPdfFixture = fixture('RR4 Oversized PDF.pdf', 'application/pdf', buildPdf(1, 12_000, 18_000));
