import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const origin = 'https://thiepn.dev/library';
const worksRoot = path.join(process.cwd(), 'src/content/works');
const releasesRoot = path.join(process.cwd(), 'src/publications/releases');

async function fetchBytes(url) {
  let last;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw last;
}

async function requireRoute(url) {
  const bytes = await fetchBytes(url);
  if (!bytes.length) throw new Error(`Empty production response: ${url}`);
  console.log(`LIVE ${url}`);
  return bytes;
}

for (const entry of await readdir(worksRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const work = YAML.parse(await readFile(path.join(worksRoot, entry.name, 'work.yaml'), 'utf8'));
  if (work.visibility !== 'public' || !['published', 'archived'].includes(work.status)) continue;
  await requireRoute(`${origin}/works/${work.slug}`);
  if (work.formats?.web?.enabled) await requireRoute(`${origin}/works/${work.slug}/read`);

  const version = work.publication?.activeRelease;
  if (!version) continue;
  const release = YAML.parse(await readFile(path.join(releasesRoot, work.id, `${version}.yaml`), 'utf8'));
  for (const [kind, artifact] of Object.entries(release.artifacts ?? {})) {
    const bytes = await fetchBytes(String(artifact.url));
    if (bytes.length !== Number(artifact.sizeBytes)) throw new Error(`${work.id} ${kind}: live size mismatch`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== String(artifact.sha256).toLowerCase()) throw new Error(`${work.id} ${kind}: live SHA-256 mismatch`);
    console.log(`LIVE_MEDIA ${work.id}@${version} ${kind}`);
  }
}

await requireRoute(`${origin}/`);
await requireRoute(`${origin}/search`);
await requireRoute(`${origin}/subjects`);
await requireRoute(`${origin}/collections`);

const manifestBytes = await requireRoute(`${origin}/manifest.webmanifest`);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.id !== '/library/' || manifest.start_url !== '/library/' || manifest.scope !== '/library/' || manifest.display !== 'standalone') {
  throw new Error('Production P28 manifest scope/install metadata mismatch');
}
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.purpose === 'maskable')) {
  throw new Error('Production P28 manifest is missing its maskable install icon');
}

const serviceWorker = (await requireRoute(`${origin}/service-worker.js`)).toString('utf8');
if (!serviceWorker.includes("const SW_VERSION = 'p28-v1'")
  || !serviceWorker.includes("const CACHE_PREFIX = 'thiepn-library-pwa-'")
  || !serviceWorker.includes("url.pathname.startsWith(scoped('media/'))")
  || !serviceWorker.includes('/\\.epub$/i.test(url.pathname)')) {
  throw new Error('Production P28 service-worker cache contract mismatch');
}

const offline = (await requireRoute(`${origin}/offline/`)).toString('utf8');
if (!offline.includes('You’re offline.')) throw new Error('Production P28 offline fallback mismatch');

console.log('PRODUCTION_VERIFICATION_PASS');
