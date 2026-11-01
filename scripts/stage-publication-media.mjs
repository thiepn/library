import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
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
  await new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, `--file=${target}`, '--remote'],
      { stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`${label}: failed to download from R2 (exit ${code})`)));
  });

  const actualSize = (await stat(target)).size;
  if (actualSize !== expectedSize) throw new Error(`${label}: size mismatch ${actualSize} != ${expectedSize}`);
  const actualHash = await sha256(target);
  if (actualHash !== expectedHash) throw new Error(`${label}: SHA-256 mismatch`);
}

const files = await walk(releasesRoot);
const pending = [];
const seen = new Map();
let stagedReferences = 0;
function enqueue(task) {
  const existing = seen.get(task.key);
  if (existing) {
    if (existing.expectedHash !== task.expectedHash || existing.expectedSize !== task.expectedSize || existing.target !== task.target) {
      throw new Error(`Conflicting immutable publication registration for R2 key ${task.key}`);
    }
  } else {
    seen.set(task.key, task);
    pending.push(task);
  }
  stagedReferences++;
}
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
    enqueue({
      key,
      target,
      expectedSize: Number(artifact.sizeBytes),
      expectedHash: String(artifact.sha256).toLowerCase(),
      label: `${releaseFile}: ${kind}`,
      description: `${release.workId}@${release.version} ${kind}`,
    });
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
  enqueue({
    key,
    target: path.join(distMediaRoot, 'unlisted', `${assetId}.bin`),
    expectedSize: Number(manifest.sizeBytes),
    expectedHash: String(manifest.sha256 ?? '').toLowerCase(),
    label: `${manifestFile}: encrypted asset`,
    description: `unlisted encrypted asset ${assetId}`,
  });
}
if (pending.length === 0) throw new Error('No canonical publication media found to stage');
let cursor = 0;
const concurrency = Math.min(6, pending.length);
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < pending.length) {
    const task = pending[cursor++];
    await stageObject(task);
    console.log(`STAGED ${task.description} ${task.key}`);
  }
}));
console.log(`PUBLICATION_MEDIA_STAGE_PASS ${pending.length} distinct artifact(s), ${stagedReferences} registered reference(s)`);
