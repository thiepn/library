import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const root = process.cwd();
const expected = JSON.parse(await readFile(path.join(root, 'src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json'), 'utf8'));
const workId = expected.workId;
const version = expected.release;
const base = `https://thiepn.dev/library/media/works/${workId}/editions/${version}`;
const target = path.join(root, 'src/publications/releases', workId, `${version}.yaml`);
const mediaDir = path.resolve(process.env.L17B_R2_MEDIA_DIR ?? path.join(root, '.build/l17b-r2-verify'));
const verificationMarker = path.join(mediaDir, '.r2-verified');

const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

async function sha256(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

async function assertVerifiedAsset(kind, asset) {
  const file = path.join(mediaDir, asset.filename);
  if (!(await exists(file))) throw new Error(`${kind}: verified R2 download missing: ${asset.filename}`);
  const info = await stat(file);
  if (info.size !== asset.bytes) throw new Error(`${kind}: byte size ${info.size} != ${asset.bytes}`);
  const hash = await sha256(file);
  if (hash !== asset.sha256) throw new Error(`${kind}: SHA-256 ${hash} != ${asset.sha256}`);
}

if (!(await exists(verificationMarker))) {
  throw new Error(`refusing to write canonical release registry without R2 verification marker: ${verificationMarker}`);
}

for (const [kind, asset] of Object.entries(expected.assets)) {
  await assertVerifiedAsset(kind, asset);
}

const release = {
  schemaVersion: 1,
  workId,
  version,
  edition: 1,
  releasedAt: '2026-08-22',
  sourceHash: expected.package.sha256,
  artifacts: {
    pdf: {
      url: `${base}/${expected.assets.pdf.filename}`,
      filename: expected.assets.pdf.filename,
      mimeType: 'application/pdf',
      sizeBytes: expected.assets.pdf.bytes,
      sha256: expected.assets.pdf.sha256,
    },
    epub: {
      url: `${base}/${expected.assets.epub.filename}`,
      filename: expected.assets.epub.filename,
      mimeType: 'application/epub+zip',
      sizeBytes: expected.assets.epub.bytes,
      sha256: expected.assets.epub.sha256,
    },
  },
};

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, YAML.stringify(release), 'utf8');
console.log(`[L17B-2] wrote canonical release registry after verified R2 readback: ${path.relative(root, target)}`);
