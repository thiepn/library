import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

const releasesRoot = path.join(process.cwd(), 'src/publications/releases');
const distMediaRoot = path.join(process.cwd(), 'dist/library/media');
const bucket = process.env.R2_BUCKET || 'thiepn-library-publications';
const mediaPrefix = '/library/media/';

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
    if (!key || key.includes('..')) throw new Error(`${releaseFile}: invalid R2 key for ${kind}`);
    const target = path.join(distMediaRoot, key);
    await mkdir(path.dirname(target), { recursive: true });

    const result = spawnSync('pnpm', ['exec', 'wrangler', 'r2', 'object', 'get', `${bucket}/${key}`, `--file=${target}`, '--remote'], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${releaseFile}: failed to download ${kind} from R2`);

    const actualSize = (await stat(target)).size;
    const expectedSize = Number(artifact.sizeBytes);
    if (actualSize !== expectedSize) throw new Error(`${releaseFile}: ${kind} size mismatch ${actualSize} != ${expectedSize}`);
    const actualHash = await sha256(target);
    const expectedHash = String(artifact.sha256).toLowerCase();
    if (actualHash !== expectedHash) throw new Error(`${releaseFile}: ${kind} SHA-256 mismatch`);
    staged++;
    console.log(`STAGED ${release.workId}@${release.version} ${kind} ${key}`);
  }
}

if (!staged) throw new Error('No canonical publication media found to stage');
console.log(`PUBLICATION_MEDIA_STAGE_PASS ${staged} artifact(s)`);
