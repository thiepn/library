export type PublicationFormat = 'epub' | 'pdf';
export type PublicationCompatibilityDisposition = 'supported' | 'degraded' | 'unsupported' | 'hostile';

export type PublicationCompatibilityCode =
  | 'file-empty'
  | 'epub-not-zip'
  | 'epub-zip64-unsupported'
  | 'epub-path-unsafe'
  | 'epub-duplicate-entry'
  | 'epub-encrypted-entry'
  | 'epub-unsupported-compression'
  | 'epub-entry-limit'
  | 'epub-expanded-size-limit'
  | 'epub-compression-ratio-limit'
  | 'epub-local-header-invalid'
  | 'epub-entry-size-mismatch'
  | 'epub-mimetype-invalid'
  | 'epub-container-missing'
  | 'epub-package-missing'
  | 'epub-spine-missing'
  | 'epub-resource-missing'
  | 'epub-encryption-unsupported'
  | 'epub-remote-resource'
  | 'pdf-header-invalid'
  | 'pdf-eof-missing'
  | 'pdf-encrypted'
  | 'pdf-active-content';

export interface PublicationCompatibilityReport {
  schemaVersion: 1;
  format: PublicationFormat;
  disposition: PublicationCompatibilityDisposition;
  profile: string;
  warnings: string[];
  features: string[];
  capabilities: {
    search: 'available' | 'document-dependent' | 'unavailable';
    selection: 'available' | 'document-dependent' | 'unavailable';
    scriptedContent: 'disabled' | 'not-present' | 'blocked';
    remoteResources: 'none' | 'blocked';
  };
  metrics: Record<string, number | string | boolean>;
}

export class PublicationCompatibilityError extends Error {
  readonly code: PublicationCompatibilityCode;
  readonly disposition: Extract<PublicationCompatibilityDisposition, 'unsupported' | 'hostile'>;

  constructor(
    code: PublicationCompatibilityCode,
    message: string,
    disposition: Extract<PublicationCompatibilityDisposition, 'unsupported' | 'hostile'> = 'unsupported',
  ) {
    super(message);
    this.name = 'PublicationCompatibilityError';
    this.code = code;
    this.disposition = disposition;
  }
}

const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 500;
const MAX_INSPECTION_ENTRY_BYTES = 8 * 1024 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: false });
const latin1Decoder = new TextDecoder('windows-1252', { fatal: false });

interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

function failure(
  code: PublicationCompatibilityCode,
  message: string,
  disposition: Extract<PublicationCompatibilityDisposition, 'unsupported' | 'hostile'> = 'unsupported',
): never {
  throw new PublicationCompatibilityError(code, message, disposition);
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function safeZipName(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-z]:/i.test(name)) return false;
  const parts = name.split('/');
  return !parts.some((part) => part === '..' || part === '.');
}

function findEocd(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] === 0x50
      && bytes[offset + 1] === 0x4b
      && bytes[offset + 2] === 0x05
      && bytes[offset + 3] === 0x06
    ) return offset;
  }
  return -1;
}

function parseZip(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) failure('epub-not-zip', 'This file is not a readable EPUB ZIP package.');
  const view = new DataView(buffer);
  const eocd = findEocd(bytes);
  if (eocd < 0) failure('epub-not-zip', 'This file is not a readable EPUB ZIP package.');

  const disk = u16(view, eocd + 4);
  const centralDisk = u16(view, eocd + 6);
  const entriesOnDisk = u16(view, eocd + 8);
  const entryCount = u16(view, eocd + 10);
  const centralSize = u32(view, eocd + 12);
  const centralOffset = u32(view, eocd + 16);
  if (
    disk !== 0
    || centralDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
  ) failure('epub-zip64-unsupported', 'Multipart and ZIP64 EPUB packages are not supported.');
  if (entryCount <= 0 || entryCount > MAX_ARCHIVE_ENTRIES) {
    failure('epub-entry-limit', `This EPUB contains too many archive entries. The limit is ${MAX_ARCHIVE_ENTRIES}.`, 'hostile');
  }
  if (centralOffset + centralSize > eocd || centralOffset < 0) {
    failure('epub-not-zip', 'This EPUB has an invalid ZIP directory.');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  let totalExpanded = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocd || u32(view, offset) !== 0x02014b50) {
      failure('epub-not-zip', 'This EPUB has an invalid ZIP directory.');
    }
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > eocd) failure('epub-not-zip', 'This EPUB has a truncated ZIP directory.');

    const rawName = bytes.slice(offset + 46, offset + 46 + nameLength);
    const name = (flags & 0x0800 ? textDecoder : latin1Decoder).decode(rawName);
    if (!safeZipName(name)) {
      failure('epub-path-unsafe', `This EPUB contains an unsafe archive path: ${name || '(empty)'}.`, 'hostile');
    }
    if (names.has(name)) failure('epub-duplicate-entry', `This EPUB contains the duplicate archive entry “${name}”.`, 'hostile');
    names.add(name);
    if ((flags & 0x0001) !== 0 || (flags & 0x0040) !== 0) {
      failure('epub-encrypted-entry', 'Encrypted ZIP entries are not supported in EPUB imports.');
    }
    if (method !== 0 && method !== 8) {
      failure('epub-unsupported-compression', `This EPUB uses unsupported ZIP compression method ${method}.`);
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      failure('epub-expanded-size-limit', 'An EPUB archive entry exceeds the 128 MB expanded-size limit.', 'hostile');
    }
    totalExpanded += uncompressedSize;
    if (totalExpanded > MAX_EXPANDED_BYTES) {
      failure('epub-expanded-size-limit', 'This EPUB exceeds the 512 MB total expanded-size limit.', 'hostile');
    }
    const ratio = compressedSize === 0 ? (uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY) : uncompressedSize / compressedSize;
    if (ratio > MAX_COMPRESSION_RATIO) {
      failure('epub-compression-ratio-limit', 'This EPUB exceeds the safe archive-compression ratio.', 'hostile');
    }

    entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
    offset = end;
  }

  return entries;
}

async function inflateRaw(bytes: Uint8Array, maximum: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    failure('epub-unsupported-compression', 'This browser cannot inspect compressed EPUB packages safely.');
  }
  const owned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const source = new Blob([owned]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      failure('epub-entry-size-mismatch', 'An EPUB entry expanded beyond its declared size.', 'hostile');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out;
}

async function readZipEntry(buffer: ArrayBuffer, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (entry.localOffset + 30 > bytes.length || u32(view, entry.localOffset) !== 0x04034b50) {
    failure('epub-local-header-invalid', `This EPUB has an invalid local header for “${entry.name}”.`);
  }
  const nameLength = u16(view, entry.localOffset + 26);
  const extraLength = u16(view, entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) failure('epub-local-header-invalid', `This EPUB has truncated data for “${entry.name}”.`);
  const compressed = bytes.slice(dataStart, dataEnd);
  const result = entry.method === 0
    ? compressed
    : await inflateRaw(compressed, Math.min(MAX_ENTRY_BYTES, entry.uncompressedSize + 1));
  if (result.byteLength !== entry.uncompressedSize) {
    failure('epub-entry-size-mismatch', `The EPUB entry “${entry.name}” does not match its declared size.`, 'hostile');
  }
  return result;
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return (match?.[1] ?? match?.[2])?.trim() || undefined;
}

function xmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function normalizePackagePath(basePath: string, href: string): string | undefined {
  const value = xmlEntities(href.trim()).split('#', 1)[0]?.split('?', 1)[0] ?? '';
  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return undefined;
  const segments = `${basePath ? `${basePath}/` : ''}${value}`.split('/');
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!normalized.length) return undefined;
      normalized.pop();
    } else normalized.push(segment);
  }
  return normalized.join('/');
}

function remoteReferences(text: string): boolean {
  return /(?:src|poster|data)\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)
    || /<link\b[^>]*href\s*=\s*["']\s*(?:https?:)?\/\//i.test(text)
    || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(text)
    || /@import\s+(?:url\()?\s*["']?\s*(?:https?:)?\/\//i.test(text);
}

function tags(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function highestDisposition(current: PublicationCompatibilityDisposition, next: PublicationCompatibilityDisposition): PublicationCompatibilityDisposition {
  const rank: Record<PublicationCompatibilityDisposition, number> = { supported: 0, degraded: 1, unsupported: 2, hostile: 3 };
  return rank[next] > rank[current] ? next : current;
}

async function inspectEpub(buffer: ArrayBuffer): Promise<PublicationCompatibilityReport> {
  const entries = parseZip(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const mimetype = byName.get('mimetype');
  if (!mimetype) failure('epub-mimetype-invalid', 'This EPUB is missing its mimetype entry.');
  const mimetypeText = textDecoder.decode(await readZipEntry(buffer, mimetype)).trim();
  if (mimetype.method !== 0 || mimetypeText !== 'application/epub+zip') {
    failure('epub-mimetype-invalid', 'This EPUB has an invalid mimetype entry.');
  }

  const container = byName.get('META-INF/container.xml');
  if (!container) failure('epub-container-missing', 'This EPUB is missing META-INF/container.xml.');
  const containerText = textDecoder.decode(await readZipEntry(buffer, container));
  const rootfileTag = containerText.match(/<rootfile\b[^>]*>/i)?.[0];
  const packagePath = rootfileTag ? attribute(rootfileTag, 'full-path') : undefined;
  if (!packagePath || !safeZipName(packagePath)) failure('epub-package-missing', 'This EPUB does not identify a safe package document.');
  const packageEntry = byName.get(packagePath);
  if (!packageEntry) failure('epub-package-missing', `This EPUB package document is missing: ${packagePath}.`);
  if (packageEntry.uncompressedSize > MAX_INSPECTION_ENTRY_BYTES) {
    failure('epub-package-missing', 'This EPUB package document is too large to inspect safely.');
  }
  const packageText = textDecoder.decode(await readZipEntry(buffer, packageEntry));
  const packageTag = packageText.match(/<package\b[^>]*>/i)?.[0] ?? '';
  const version = attribute(packageTag, 'version') ?? 'unknown';
  const packageDirectory = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/')) : '';

  const manifest = new Map<string, { href: string; mediaType: string; properties: string }>();
  for (const itemTag of tags(packageText, /<item\b[^>]*>/gi)) {
    const id = attribute(itemTag, 'id');
    const href = attribute(itemTag, 'href');
    if (!id || !href) continue;
    manifest.set(id, {
      href,
      mediaType: attribute(itemTag, 'media-type') ?? '',
      properties: attribute(itemTag, 'properties') ?? '',
    });
  }
  const spineTag = packageText.match(/<spine\b[^>]*>/i)?.[0] ?? '';
  const itemRefs = tags(packageText, /<itemref\b[^>]*>/gi)
    .map((tag) => ({ idref: attribute(tag, 'idref'), properties: attribute(tag, 'properties') ?? '' }))
    .filter((item): item is { idref: string; properties: string } => Boolean(item.idref));
  if (!itemRefs.length) failure('epub-spine-missing', 'This EPUB has no readable spine items.');

  const warnings: string[] = [];
  const features = new Set<string>();
  const inspectableTexts: string[] = [packageText];
  let disposition: PublicationCompatibilityDisposition = 'supported';
  const fixedLayout = /rendition:layout\s*["']?\s*(?:content=["']pre-paginated|>\s*pre-paginated)/i.test(packageText)
    || itemRefs.some((item) => /rendition:layout-pre-paginated/i.test(item.properties));
  const progression = attribute(spineTag, 'page-progression-direction') ?? attribute(packageTag, 'dir') ?? 'ltr';
  if (progression.toLowerCase() === 'rtl') features.add('rtl');

  for (const itemRef of itemRefs) {
    const item = manifest.get(itemRef.idref);
    if (!item) failure('epub-resource-missing', `The EPUB spine references unknown manifest item “${itemRef.idref}”.`);
    const resolved = normalizePackagePath(packageDirectory, item.href);
    if (!resolved) failure('epub-remote-resource', `The EPUB spine uses an external or unsafe resource: ${item.href}.`);
    if (!byName.has(resolved)) failure('epub-resource-missing', `The EPUB is missing spine resource “${resolved}”.`);
  }

  const navItem = [...manifest.values()].find((item) => /(?:^|\s)nav(?:\s|$)/i.test(item.properties));
  const ncxId = attribute(spineTag, 'toc');
  const ncxItem = ncxId ? manifest.get(ncxId) : [...manifest.values()].find((item) => item.mediaType === 'application/x-dtbncx+xml');
  if (!navItem && !ncxItem) {
    warnings.push('No EPUB navigation document is available; chapter navigation may be limited.');
    disposition = highestDisposition(disposition, 'degraded');
  } else features.add(navItem ? 'epub3-navigation' : 'epub2-ncx');

  for (const item of manifest.values()) {
    const resolved = normalizePackagePath(packageDirectory, item.href);
    if (!resolved) {
      failure('epub-remote-resource', `This EPUB references a remote resource: ${item.href}.`, 'hostile');
    }
    const entry = byName.get(resolved);
    if (!entry) {
      if (/^(?:application\/xhtml\+xml|text\/css|image\/|font\/|application\/font|audio\/|video\/)/i.test(item.mediaType)) {
        failure('epub-resource-missing', `The EPUB manifest resource “${resolved}” is missing.`);
      }
      continue;
    }
    if (entry.uncompressedSize <= MAX_INSPECTION_ENTRY_BYTES && /(?:xhtml|html|xml|css|javascript|svg)/i.test(item.mediaType)) {
      inspectableTexts.push(textDecoder.decode(await readZipEntry(buffer, entry)));
    }
    if (/^image\//i.test(item.mediaType)) features.add('images');
    if (item.mediaType === 'image/svg+xml') features.add('svg');
    if (/^(?:audio|video)\//i.test(item.mediaType)) features.add('media');
    if (/font|woff|opentype|truetype/i.test(item.mediaType)) features.add('embedded-fonts');
    if (/(?:^|\s)scripted(?:\s|$)/i.test(item.properties)) features.add('scripted-content');
    if (/(?:^|\s)mathml(?:\s|$)/i.test(item.properties)) features.add('mathml');
    if (/(?:^|\s)svg(?:\s|$)/i.test(item.properties)) features.add('svg');
    if (/(?:^|\s)remote-resources(?:\s|$)/i.test(item.properties)) {
      failure('epub-remote-resource', 'This EPUB declares remote resources, which are blocked for local reading.', 'hostile');
    }
  }

  const combined = inspectableTexts.join('\n');
  if (remoteReferences(combined)) {
    failure('epub-remote-resource', 'This EPUB attempts to load remote publication resources, which are blocked.', 'hostile');
  }
  if (/<script\b|javascript\s*:/i.test(combined)) {
    features.add('scripted-content');
    warnings.push('Publication scripts are disabled in the reader.');
    disposition = highestDisposition(disposition, 'degraded');
  }
  if (/<math\b/i.test(combined)) features.add('mathml');
  if (/<svg\b/i.test(combined)) features.add('svg');
  if (/<table\b/i.test(combined)) features.add('tables');
  if (/<(?:pre|code)\b/i.test(combined)) features.add('code');
  if (/<aside\b[^>]*(?:epub:type|role)\s*=\s*["'][^"']*(?:footnote|doc-footnote)/i.test(combined)) features.add('notes');
  if (/<nav\b[^>]*epub:type\s*=\s*["'][^"']*landmarks/i.test(combined)) features.add('landmarks');
  if (/<nav\b[^>]*epub:type\s*=\s*["'][^"']*page-list/i.test(combined)) features.add('page-list');
  if (/writing-mode\s*:\s*vertical-(?:rl|lr)/i.test(combined)) features.add('vertical-writing');
  if (/lang\s*=\s*["'](?:zh|ja|ko)(?:-|["'])/i.test(combined)) features.add('cjk');
  if (/<a\b[^>]*href\s*=\s*["']https?:\/\//i.test(combined)) features.add('external-links');
  if (/<a\b[^>]*href\s*=\s*["'](?!https?:|\/\/|#|mailto:|tel:)[^"']+/i.test(combined)) features.add('internal-links');

  const encryption = byName.get('META-INF/encryption.xml');
  if (encryption) {
    const encryptionText = textDecoder.decode(await readZipEntry(buffer, encryption));
    const algorithms = [...encryptionText.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    const fontOnly = algorithms.length > 0 && algorithms.every((algorithm) =>
      algorithm === 'http://www.idpf.org/2008/embedding'
      || algorithm === 'http://ns.adobe.com/pdf/enc#RC');
    if (!fontOnly) failure('epub-encryption-unsupported', 'This EPUB uses unsupported DRM or content encryption.');
    features.add('obfuscated-fonts');
  }

  if (fixedLayout) {
    features.add('fixed-layout');
    warnings.push('Fixed-layout EPUB opens with publisher geometry; typography and reflow controls may be limited.');
    disposition = highestDisposition(disposition, 'degraded');
  } else features.add('reflowable');

  return {
    schemaVersion: 1,
    format: 'epub',
    disposition,
    profile: fixedLayout ? `EPUB ${version} fixed-layout` : `EPUB ${version} reflowable`,
    warnings,
    features: [...features].sort(),
    capabilities: {
      search: 'available',
      selection: fixedLayout ? 'document-dependent' : 'available',
      scriptedContent: features.has('scripted-content') ? 'disabled' : 'not-present',
      remoteResources: 'none',
    },
    metrics: {
      archiveEntries: entries.length,
      expandedBytes: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
      spineItems: itemRefs.length,
      manifestItems: manifest.size,
      fixedLayout,
      progression,
    },
  };
}

function includesAscii(bytes: Uint8Array, token: string): boolean {
  const target = [...token].map((character) => character.charCodeAt(0));
  outer: for (let index = 0; index <= bytes.length - target.length; index += 1) {
    if (bytes[index] !== target[0]) continue;
    for (let offset = 1; offset < target.length; offset += 1) {
      if (bytes[index + offset] !== target[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function countAscii(bytes: Uint8Array, token: string): number {
  const target = [...token].map((character) => character.charCodeAt(0));
  let count = 0;
  outer: for (let index = 0; index <= bytes.length - target.length; index += 1) {
    if (bytes[index] !== target[0]) continue;
    for (let offset = 1; offset < target.length; offset += 1) {
      if (bytes[index + offset] !== target[offset]) continue outer;
    }
    count += 1;
    index += target.length - 1;
  }
  return count;
}

function inspectPdf(buffer: ArrayBuffer): PublicationCompatibilityReport {
  const bytes = new Uint8Array(buffer);
  const headerWindow = latin1Decoder.decode(bytes.slice(0, Math.min(bytes.length, 1024)));
  const version = headerWindow.match(/%PDF-(\d\.\d)/)?.[1];
  if (!version) failure('pdf-header-invalid', 'This file does not have a valid PDF header.');
  const tail = latin1Decoder.decode(bytes.slice(Math.max(0, bytes.length - 65_536)));
  if (!tail.includes('%%EOF')) failure('pdf-eof-missing', 'This PDF is incomplete or missing its end marker.');
  if (includesAscii(bytes, '/Encrypt')) failure('pdf-encrypted', 'Password-protected or encrypted PDFs are not supported.');
  if (
    includesAscii(bytes, '/JavaScript')
    || includesAscii(bytes, '/Launch')
    || includesAscii(bytes, '/RichMedia')
  ) failure('pdf-active-content', 'PDF files containing active scripts, launch actions, or rich media are blocked.', 'hostile');

  const features = new Set<string>();
  if (includesAscii(bytes, '/AcroForm')) features.add('forms');
  if (includesAscii(bytes, '/Annots')) features.add('annotations-or-links');
  if (includesAscii(bytes, '/Rotate')) features.add('rotation');
  if (includesAscii(bytes, '/Subtype /Image') || includesAscii(bytes, '/Subtype/Image')) features.add('images');
  const incrementalSections = countAscii(bytes, 'startxref');
  if (incrementalSections > 1) features.add('incremental-update');
  const pageMarkers = Math.max(1, countAscii(bytes, '/Type /Page') - countAscii(bytes, '/Type /Pages'));

  return {
    schemaVersion: 1,
    format: 'pdf',
    disposition: 'supported',
    profile: `PDF ${version}`,
    warnings: [],
    features: [...features].sort(),
    capabilities: {
      search: 'document-dependent',
      selection: 'document-dependent',
      scriptedContent: 'blocked',
      remoteResources: 'none',
    },
    metrics: {
      bytes: bytes.length,
      approximatePages: pageMarkers,
      incrementalSections,
      pdfVersion: version,
    },
  };
}

export async function inspectPublication(
  buffer: ArrayBuffer,
  format: PublicationFormat,
): Promise<PublicationCompatibilityReport> {
  if (buffer.byteLength <= 0) failure('file-empty', 'This file is empty.');
  return format === 'epub' ? inspectEpub(buffer) : inspectPdf(buffer);
}

export function compatibilitySummary(report: PublicationCompatibilityReport): string {
  const suffix = report.warnings.length ? ` · ${report.warnings.join(' ')}` : '';
  return `${report.profile}${suffix}`;
}
