import { deflateRawSync } from 'node:zlib';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

interface ZipEntry { name: string; content: string | Buffer; method?: 0 | 8; }
interface HostedFixture { urlPath: string; sizeBytes: number; format: 'epub' | 'pdf'; }

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
    const compressed = method === 0 ? content : deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
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
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
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

function buildEpub(): Buffer {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:rr5-offline</dc:identifier><dc:title>RR5 Offline EPUB</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">2026-08-28T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="one.xhtml">One</a></li><li><a href="two.xhtml">Two</a></li></ol></nav></body></html>`;
  const one = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head><body><h1>Offline EPUB</h1><p>RR5 explicit offline publication fixture.</p></body></html>`;
  const two = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Two</title></head><body><h1>Second section</h1><p>RR5 OFFLINE EPUB MARKER</p></body></html>`;
  return zip([
    { name: 'mimetype', content: 'application/epub+zip', method: 0 },
    { name: 'META-INF/container.xml', content: container },
    { name: 'OEBPS/content.opf', content: opf },
    { name: 'OEBPS/nav.xhtml', content: nav },
    { name: 'OEBPS/one.xhtml', content: one },
    { name: 'OEBPS/two.xhtml', content: two },
  ]);
}

function pdfEscape(value: string): string { return value.replace(/([\\()])/g, '\\$1'); }

export function buildOfflinePdf(label = 'RR5 Offline PDF', pages = 3): Buffer {
  const pageIds = Array.from({ length: pages }, (_, index) => 4 + index * 2);
  const objectCount = 3 + pages * 2;
  const objects = new Map<number, string>();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (let index = 0; index < pages; index += 1) {
    const pageId = pageIds[index]!;
    const contentId = pageId + 1;
    const stream = `BT /F1 14 Tf 72 720 Td (${pdfEscape(`${label} page ${index + 1}`)}) Tj ET`;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  }
  const header = '%PDF-1.7\n%RR5\n';
  const chunks = [header];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let cursor = Buffer.byteLength(header, 'latin1');
  for (let id = 1; id <= objectCount; id += 1) {
    const chunk = `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
    offsets[id] = cursor;
    chunks.push(chunk);
    cursor += Buffer.byteLength(chunk, 'latin1');
  }
  const xrefOffset = cursor;
  chunks.push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(''), 'latin1');
}

async function releaseFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await releaseFiles(full));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function firstArtifact(kind: 'epub' | 'pdf'): Promise<{ url: string }> {
  for (const file of await releaseFiles(path.join(process.cwd(), 'src/publications/releases'))) {
    const release = YAML.parse(await readFile(file, 'utf8'));
    const artifact = release?.artifacts?.[kind];
    if (artifact?.url) return { url: String(artifact.url) };
  }
  throw new Error(`No ${kind} release artifact exists for RR5 fixture staging.`);
}

async function stageAtCanonicalPath(kind: 'epub' | 'pdf', synthetic: Buffer): Promise<HostedFixture> {
  const artifact = await firstArtifact(kind);
  const url = new URL(artifact.url);
  const urlPath = url.pathname;
  if (!urlPath.startsWith('/library/media/')) throw new Error(`Unexpected canonical ${kind} path: ${urlPath}`);
  const relative = urlPath.slice('/library/'.length);
  const target = path.join(process.cwd(), 'dist/library', relative);

  if (process.env.RR5_USE_SYNTHETIC_MEDIA === '1') {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, synthetic);
  } else {
    await stat(target).catch(() => { throw new Error(`Production RR5 expected staged canonical media at ${target}`); });
  }

  return { urlPath, sizeBytes: (await stat(target)).size, format: kind };
}

export const personalEpubFixture = buildEpub();
export const personalPdfFixture = buildOfflinePdf('RR5 Personal PDF A', 2);
export const secondPersonalPdfFixture = buildOfflinePdf('RR5 Personal PDF B', 2);

export async function prepareOfflineHostedFixtures(): Promise<{ epub: HostedFixture; pdf: HostedFixture }> {
  const epub = await stageAtCanonicalPath('epub', buildEpub());
  const pdf = await stageAtCanonicalPath('pdf', buildOfflinePdf());
  const workerPath = path.join(process.cwd(), 'dist/library/service-worker.js');
  const worker = await readFile(workerPath, 'utf8');
  if (!worker.includes("const SW_VERSION = 'rr5-v1';")) throw new Error('RR5 worker version marker is missing from the build.');
  await writeFile(
    path.join(process.cwd(), 'dist/library/service-worker-next.js'),
    worker.replace("const SW_VERSION = 'rr5-v1';", "const SW_VERSION = 'rr5-v1-e2e-next';"),
    'utf8',
  );
  return { epub, pdf };
}
