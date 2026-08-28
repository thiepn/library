import { deflateRawSync } from 'node:zlib';
import type { BrowserFixtureFile } from './fixtures';

interface ZipSourceEntry {
  name: string;
  content: string | Buffer;
  method?: 0 | 8;
  flags?: number;
  declaredUncompressedSize?: number;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
  return current >>> 0;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
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
    const flags = (source.flags ?? 0) | 0x0800;
    const compressed = method === 0 ? content : deflateRawSync(content, { level: 9 });
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
    central.writeUInt32LE(source.declaredUncompressedSize ?? content.length, 24);
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

function container(packagePath = 'OEBPS/content.opf'): string {
  return `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${packagePath}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
}

function file(name: string, buffer: Buffer): BrowserFixtureFile {
  return { name, mimeType: name.endsWith('.epub') ? 'application/epub+zip' : 'application/pdf', buffer };
}

function epub(entries: ZipSourceEntry[]): Buffer {
  return zip([
    { name: 'mimetype', content: 'application/epub+zip', method: 0 },
    { name: 'META-INF/container.xml', content: container(), method: 8 },
    ...entries,
  ]);
}

const richPackage = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:rr3-rich</dc:identifier>
    <dc:title>RR3 Rich EPUB</dc:title><dc:creator>Compatibility Corpus</dc:creator><dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-08-28T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" properties="mathml svg"/>
    <item id="second" href="second.xhtml" media-type="application/xhtml+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>
    <item id="vector" href="figure.svg" media-type="image/svg+xml"/>
    <item id="raster" href="pixel.png" media-type="image/png"/>
    <item id="audio" href="silence.wav" media-type="audio/wav"/>
    <item id="font" href="corpus.woff2" media-type="font/woff2"/>
  </manifest>
  <spine><itemref idref="chapter"/><itemref idref="second"/></spine>
</package>`;

const richNav = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Navigation</title></head><body>
<nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a><ol><li><a href="second.xhtml">Nested section</a></li></ol></li></ol></nav>
<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="chapter.xhtml">Start</a></li></ol></nav>
<nav epub:type="page-list"><ol><li><a href="chapter.xhtml#page-1">1</a></li></ol></nav>
</body></html>`;

const richChapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Rich chapter</title><link rel="stylesheet" href="style.css"/></head><body>
<h1 id="page-1">RR3 rich chapter</h1><p>Searchable compatibility corpus text.</p>
<table><tr><th>Feature</th><td>Table</td></tr></table><pre><code>const safe = true;</code></pre>
<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>=</mo><mn>1</mn></math>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><text x="0" y="15">SVG</text></svg>
<img src="pixel.png" alt="One pixel raster fixture"/>
<audio controls="controls" src="silence.wav"><p>Audio transcript fallback.</p></audio>
<p><a href="second.xhtml">Internal link</a> · <a href="https://example.com/reference">External reference</a></p>
<aside epub:type="footnote" id="note">A note with fallback text.</aside>
</body></html>`;

const pixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nLkAAAAASUVORK5CYII=', 'base64');
const silenceWav = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', 'base64');
const fallbackWoff2 = Buffer.from('d09GMgABAAAAAAAsAAoAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'base64');

export const epub3RichFixture = file('rr3-epub3-rich.epub', epub([
  { name: 'OEBPS/content.opf', content: richPackage },
  { name: 'OEBPS/nav.xhtml', content: richNav },
  { name: 'OEBPS/chapter.xhtml', content: richChapter },
  { name: 'OEBPS/second.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second</title></head><body><h1>Second</h1><p>Resume target.</p></body></html>' },
  { name: 'OEBPS/style.css', content: "@font-face{font-family:Corpus;src:url('corpus.woff2') format('woff2')} body{font-family:Corpus,serif} table{border-collapse:collapse}" },
  { name: 'OEBPS/figure.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' },
  { name: 'OEBPS/pixel.png', content: pixelPng },
  { name: 'OEBPS/silence.wav', content: silenceWav },
  { name: 'OEBPS/corpus.woff2', content: fallbackWoff2 },
]));

export const epub2Fixture = file('rr3-epub2-ncx.epub', epub([
  { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="2.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr3-epub2</dc:identifier><dc:title>RR3 EPUB 2</dc:title><dc:language>en</dc:language></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="chapter"/></spine></package>` },
  { name: 'OEBPS/toc.ncx', content: `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><head/><docTitle><text>RR3 EPUB 2</text></docTitle><navMap><navPoint id="n1"><navLabel><text>Chapter</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>` },
  { name: 'OEBPS/chapter.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>EPUB 2</title></head><body><h1>EPUB 2</h1><p>Legacy navigation works.</p></body></html>' },
]));

export const fixedLayoutFixture = file('rr3-fixed-layout.epub', epub([
  { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr3-fixed</dc:identifier><dc:title>RR3 Fixed Layout</dc:title><dc:language>en</dc:language><meta property="rendition:layout">pre-paginated</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="page" href="page.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="page" properties="rendition:layout-pre-paginated"/></spine></package>` },
  { name: 'OEBPS/nav.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="page.xhtml">Page</a></li></ol></nav></body></html>' },
  { name: 'OEBPS/page.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=800,height=1200"/><title>Fixed</title></head><body><h1>Fixed page</h1></body></html>' },
]));

export const rtlVerticalFixture = file('rr3-rtl-vertical.epub', epub([
  { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="3.0" unique-identifier="id" dir="rtl" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr3-rtl</dc:identifier><dc:title>RR3 RTL Vertical</dc:title><dc:language>ja</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="css" href="vertical.css" media-type="text/css"/></manifest><spine page-progression-direction="rtl"><itemref idref="chapter"/></spine></package>` },
  { name: 'OEBPS/nav.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="ja"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">章</a></li></ol></nav></body></html>' },
  { name: 'OEBPS/chapter.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml" lang="ja"><head><link rel="stylesheet" href="vertical.css"/><title>縦書き</title></head><body><h1>縦書き</h1><p>日本語の互換性テスト。</p></body></html>' },
  { name: 'OEBPS/vertical.css', content: 'html{writing-mode:vertical-rl} body{font-family:serif}' },
]));

export const missingNavFixture = file('rr3-missing-nav.epub', epub([
  { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr3-no-nav</dc:identifier><dc:title>RR3 Missing Navigation</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>` },
  { name: 'OEBPS/chapter.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>No nav</title></head><body><h1>No navigation</h1><p>The reader should still open.</p></body></html>' },
]));

export const scriptedFixture = file('rr3-scripted.epub', epub([
  { name: 'OEBPS/content.opf', content: `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">rr3-scripted</dc:identifier><dc:title>RR3 Scripted Attempt</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" properties="scripted"/></manifest><spine><itemref idref="chapter"/></spine></package>` },
  { name: 'OEBPS/nav.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Script</a></li></ol></nav></body></html>' },
  { name: 'OEBPS/chapter.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Script attempt</title><script>window.parent.__rr3ScriptRan=true</script></head><body><h1>Script disabled</h1></body></html>' },
]));

const richSupportEntries: ZipSourceEntry[] = [
  { name: 'OEBPS/nav.xhtml', content: richNav },
  { name: 'OEBPS/chapter.xhtml', content: richChapter },
  { name: 'OEBPS/second.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><body>Second</body></html>' },
  { name: 'OEBPS/figure.svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
  { name: 'OEBPS/pixel.png', content: pixelPng },
  { name: 'OEBPS/silence.wav', content: silenceWav },
  { name: 'OEBPS/corpus.woff2', content: fallbackWoff2 },
];

export const remoteResourceFixture = file('rr3-remote-resource.epub', epub([
  { name: 'OEBPS/content.opf', content: richPackage.replace('href="style.css"', 'href="https://example.invalid/remote.css"') },
  ...richSupportEntries,
]));

export const missingPackageFixture = file('rr3-missing-package.epub', zip([
  { name: 'mimetype', content: 'application/epub+zip', method: 0 },
  { name: 'META-INF/container.xml', content: container('OEBPS/missing.opf') },
]));

export const missingSpineFixture = file('rr3-missing-spine.epub', epub([
  { name: 'OEBPS/content.opf', content: '<?xml version="1.0"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine/></package>' },
  { name: 'OEBPS/chapter.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml"><body>Missing spine</body></html>' },
]));

export const missingResourceFixture = file('rr3-missing-resource.epub', epub([
  { name: 'OEBPS/content.opf', content: '<?xml version="1.0"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf"><metadata/><manifest><item id="chapter" href="missing.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>' },
]));

export const encryptedEpubFixture = file('rr3-encrypted.epub', epub([
  { name: 'OEBPS/content.opf', content: richPackage },
  ...richSupportEntries,
  { name: 'OEBPS/style.css', content: 'body{}' },
  { name: 'META-INF/encryption.xml', content: '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData><EncryptionMethod Algorithm="urn:example:drm"/></EncryptedData></encryption>' },
]));

export const traversalEpubFixture = file('rr3-traversal.epub', epub([
  { name: 'OEBPS/content.opf', content: richPackage },
  { name: '../outside.xhtml', content: '<html>unsafe</html>' },
]));

export const zipBombEpubFixture = file('rr3-zip-bomb.epub', zip([
  { name: 'mimetype', content: 'application/epub+zip', method: 0 },
  { name: 'META-INF/container.xml', content: container() },
  { name: 'OEBPS/content.opf', content: richPackage },
  { name: 'OEBPS/bomb.txt', content: 'x', declaredUncompressedSize: 100 * 1024 * 1024 },
]));

interface PdfObject { id: number; body: string }

function pdf(objects: PdfObject[], root = 1): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'binary')];
  const offsets = new Map<number, number>();
  let length = chunks[0].length;
  for (const object of objects) {
    offsets.set(object.id, length);
    const chunk = Buffer.from(`${object.id} 0 obj\n${object.body}\nendobj\n`, 'binary');
    chunks.push(chunk);
    length += chunk.length;
  }
  const maxId = Math.max(...objects.map((object) => object.id));
  const xrefOffset = length;
  const xref: string[] = [`xref\n0 ${maxId + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= maxId; id += 1) xref.push(`${String(offsets.get(id) ?? 0).padStart(10, '0')} 00000 ${offsets.has(id) ? 'n' : 'f'} \n`);
  xref.push(`trailer\n<< /Size ${maxId + 1} /Root ${root} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  chunks.push(Buffer.from(xref.join(''), 'binary'));
  return Buffer.concat(chunks);
}

function stream(content: string): string {
  return `<< /Length ${Buffer.byteLength(content, 'binary')} >>\nstream\n${content}\nendstream`;
}

export const textPdfFixture = file('rr3-text-mixed-pages.pdf', pdf([
  { id: 1, body: '<< /Type /Catalog /Pages 2 0 R /AcroForm 8 0 R >>' },
  { id: 2, body: '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>' },
  { id: 3, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R /Annots [9 0 R] >>' },
  { id: 4, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Rotate 90 /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>' },
  { id: 5, body: stream('BT /F1 24 Tf 72 720 Td (RR3 searchable PDF page one) Tj ET') },
  { id: 6, body: stream('BT /F1 18 Tf 72 500 Td (Mixed size rotated page two) Tj ET') },
  { id: 7, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
  { id: 8, body: '<< /Fields [] >>' },
  { id: 9, body: '<< /Type /Annot /Subtype /Link /Rect [70 700 250 735] /Border [0 0 0] /A << /S /URI /URI (https://example.com/) >> >>' },
]));

export const imageOnlyPdfFixture = file('rr3-image-only.pdf', pdf([
  { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
  { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
  { id: 3, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>' },
  { id: 4, body: stream('0.9 g 72 500 468 180 re f 0 g 72 470 m 540 470 l S') },
]));

export const largePagePdfFixture = file('rr3-large-page.pdf', pdf([
  { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
  { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
  { id: 3, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10000 10000] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>' },
  { id: 4, body: stream('BT /F1 240 Tf 500 9000 Td (Large page scales safely) Tj ET') },
  { id: 5, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
]));

export const incrementalPdfFixture = file('rr3-incremental.pdf', Buffer.concat([
  textPdfFixture.buffer,
  Buffer.from('\n% incremental compatibility marker\nstartxref\n0\n%%EOF\n', 'binary'),
]));

export const corruptXrefPdfFixture = file(
  'rr3-corrupt-xref.pdf',
  Buffer.from(textPdfFixture.buffer.toString('binary').replace(/startxref\n\d+/, 'startxref\n999999'), 'binary'),
);

export const encryptedPdfFixture = file('rr3-encrypted.pdf', pdf([
  { id: 1, body: '<< /Type /Catalog /Pages 2 0 R /Encrypt 4 0 R >>' },
  { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
  { id: 3, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>' },
  { id: 4, body: '<< /Filter /Standard /V 4 /Length 128 >>' },
]));

export const activePdfFixture = file('rr3-active-content.pdf', pdf([
  { id: 1, body: '<< /Type /Catalog /Pages 2 0 R /OpenAction 4 0 R >>' },
  { id: 2, body: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>' },
  { id: 3, body: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>' },
  { id: 4, body: '<< /S /JavaScript /JS (app.alert(1)) >>' },
]));

export const truncatedPdfFixture = file('rr3-truncated.pdf', Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'binary'));

export const supportedEpubFixtures = [
  epub3RichFixture,
  epub2Fixture,
  fixedLayoutFixture,
  rtlVerticalFixture,
  missingNavFixture,
  scriptedFixture,
] as const;

export const rejectedEpubFixtures = [
  { fixture: remoteResourceFixture, code: 'epub-remote-resource' },
  { fixture: missingPackageFixture, code: 'epub-package-missing' },
  { fixture: missingSpineFixture, code: 'epub-spine-missing' },
  { fixture: missingResourceFixture, code: 'epub-resource-missing' },
  { fixture: encryptedEpubFixture, code: 'epub-encryption-unsupported' },
  { fixture: traversalEpubFixture, code: 'epub-path-unsafe' },
  { fixture: zipBombEpubFixture, code: 'epub-compression-ratio-limit' },
] as const;

export const supportedPdfFixtures = [
  textPdfFixture,
  imageOnlyPdfFixture,
  largePagePdfFixture,
] as const;

export const rejectedPdfFixtures = [
  { fixture: encryptedPdfFixture, code: 'pdf-encrypted' },
  { fixture: activePdfFixture, code: 'pdf-active-content' },
  { fixture: truncatedPdfFixture, code: 'pdf-eof-missing' },
] as const;

export const rr3Corpus = [
  ...supportedEpubFixtures.map((fixture) => ({ id: fixture.name, format: 'epub', expected: 'open' })),
  ...rejectedEpubFixtures.map(({ fixture, code }) => ({ id: fixture.name, format: 'epub', expected: 'reject', code })),
  ...supportedPdfFixtures.map((fixture) => ({ id: fixture.name, format: 'pdf', expected: 'open' })),
  { id: incrementalPdfFixture.name, format: 'pdf', expected: 'bounded' },
  { id: corruptXrefPdfFixture.name, format: 'pdf', expected: 'bounded' },
  ...rejectedPdfFixtures.map(({ fixture, code }) => ({ id: fixture.name, format: 'pdf', expected: 'reject', code })),
] as const;
