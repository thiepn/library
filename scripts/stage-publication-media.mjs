import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const releasesRoot = path.join(process.cwd(), 'src/publications/releases');
const unlistedAssetsRoot = path.join(process.cwd(), 'src/unlisted-assets');
const distMediaRoot = path.join(process.cwd(), 'dist/library/media');
const bucket = process.env.R2_BUCKET || 'thiepn-library-publications';
const mediaPrefix = '/library/media/';
const assetIdPattern = /^[a-f0-9]{32}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash('sha256').update(bytes).digest('hex');
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function listJsonFiles(dir) {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function stageObject({ key, target, expectedSize, expectedHash, label }) {
  if (!key || key.includes('..')) throw new Error(`${label}: invalid R2 key`);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) throw new Error(`${label}: invalid size`);
  if (!sha256Pattern.test(expectedHash)) throw new Error(`${label}: invalid SHA-256`);

  await mkdir(path.dirname(target), { recursive: true });
  const result = spawnSync(
    'pnpm',
    ['exec', 'wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, `--file=${target}`, '--remote'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`${label}: failed to download from R2`);

  const actualSize = (await stat(target)).size;
  if (actualSize !== expectedSize) throw new Error(`${label}: size mismatch ${actualSize} != ${expectedSize}`);
  const actualHash = await sha256(target);
  if (actualHash !== expectedHash) throw new Error(`${label}: SHA-256 mismatch`);
}

const files = await walk(releasesRoot);
let staged = 0;
for (const releaseFile of files) {
  const release = YAML.parse(await readFile(releaseFile, 'utf8'));
  const artifacts = release?.artifacts && typeof release.artifacts === 'object' ? release.artifacts : {};
  for (const [kind, artifact] of Object.entries(artifacts)) {
    if (!artifact || typeof artifact !== 'object') continue;
    const url = new URL(String(artifact.url));
    if (url.origin !== 'https://thiepn.dev' || !url.pathname.startsWith(mediaPrefix)) {
      throw new Error(`${releaseFile}: ${kind} URL is outside the canonical Library media origin`);
    }
    const key = decodeURIComponent(url.pathname.slice(mediaPrefix.length));
    const target = path.join(distMediaRoot, key);
    await stageObject({
      key,
      target,
      expectedSize: Number(artifact.sizeBytes),
      expectedHash: String(artifact.sha256).toLowerCase(),
      label: `${releaseFile}: ${kind}`,
    });
    staged++;
    console.log(`STAGED ${release.workId}@${release.version} ${kind} ${key}`);
  }
}

for (const manifestFile of await listJsonFiles(unlistedAssetsRoot)) {
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const assetId = String(manifest?.assetId ?? '');
  const expectedFilename = `${assetId}.json`;
  if (!assetIdPattern.test(assetId) || path.basename(manifestFile) !== expectedFilename) {
    throw new Error(`${manifestFile}: invalid unlisted asset id`);
  }
  const key = `unlisted/${assetId}.bin`;
  const target = path.join(distMediaRoot, 'unlisted', `${assetId}.bin`);
  await stageObject({
    key,
    target,
    expectedSize: Number(manifest.sizeBytes),
    expectedHash: String(manifest.sha256 ?? '').toLowerCase(),
    label: `${manifestFile}: encrypted asset`,
  });
  staged++;
  console.log(`STAGED unlisted encrypted asset ${assetId}`);
}

if (!staged) throw new Error('No canonical publication media found to stage');
console.log(`PUBLICATION_MEDIA_STAGE_PASS ${staged} artifact(s)`);
