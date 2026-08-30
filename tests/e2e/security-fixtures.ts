import { deflateRawSync } from 'node:zlib';
import type { BrowserFixtureFile } from './fixtures';

type Entry = { name: string; content: string | Buffer; method?: 0 | 8 };

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

function zip(entries: Entry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    const method = entry.method ?? 8;
    const compressed = method === 0 ? content : deflateRawSync(content, { level: 9 });
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
    localParts.push(local, name, compressed);

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
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

const localSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">
  <rect width="8" height="8" fill="#000"/>
</svg>`;

const packageDocument = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">rr9-sandbox</dc:identifier>
    <dc:title>RR9 Sandbox Attack</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" properties="scripted"/>
    <item id="local-image" href="local.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;

const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>Sandbox attack</title>
  <base href="https://example.invalid/rr9/"/>
  <script>window.parent.__rr9ScriptRan = true;</script>
</head>
<body onload="window.parent.__rr9EventRan = true">
  <h1>RR9 sandbox attack</h1>
  <img id="local-image" src="local.svg" alt="Local image"/>
  <a id="dangerous-link" href="data:text/html,&lt;script&gt;window.parent.__rr9DataRan=true&lt;/script&gt;">Dangerous navigation</a>
  <a id="javascript-link" href="javascript:window.parent.__rr9JavascriptRan=true">Javascript navigation</a>
</body>
</html>`;

const buffer = zip([
  { name: 'mimetype', content: 'application/epub+zip', method: 0 },
  {
    name: 'META-INF/container.xml',
    content: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  },
  { name: 'OEBPS/content.opf', content: packageDocument },
  { name: 'OEBPS/nav.xhtml', content: '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>' },
  { name: 'OEBPS/chapter.xhtml', content: chapter },
  { name: 'OEBPS/local.svg', content: localSvg },
]);

export const rr9SandboxEpubFixture: BrowserFixtureFile = {
  name: 'rr9-sandbox-attack.epub',
  mimeType: 'application/epub+zip',
  buffer,
};
