import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const origin = 'https://thiepn.dev/library';
const worksRoot = path.join(process.cwd(), 'src/content/works');
const releasesRoot = path.join(process.cwd(), 'src/publications/releases');
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA ?? process.env.GITHUB_SHA ?? '';

async function fetchResponse(url) {
  let last;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw last;
}

async function fetchBytes(url) {
  const response = await fetchResponse(url);
  return Buffer.from(await response.arrayBuffer());
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

const rootResponse = await fetchResponse(`${origin}/`);
const root = await rootResponse.text();
if (!root.length) throw new Error('Empty production root response');
console.log(`LIVE ${origin}/`);
const headerCsp = rootResponse.headers.get('content-security-policy');
const metaCsp = root.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([^"']+)["']/i)?.[1]
  ?? root.match(/<meta\s+content=["']([^"']+)["']\s+http-equiv=["']Content-Security-Policy["']/i)?.[1];
const effectiveCspEvidence = headerCsp ?? metaCsp;
if (!effectiveCspEvidence
  || !effectiveCspEvidence.includes("default-src 'self'")
  || !effectiveCspEvidence.includes("object-src 'none'")
  || !effectiveCspEvidence.includes("script-src 'self'")
  || !effectiveCspEvidence.includes("worker-src 'self' blob:")
  || !effectiveCspEvidence.includes('https://media.library.thiepn.dev')) {
  throw new Error('Production RR9 CSP evidence is missing or weaker than the release contract');
}
if (!/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(root)
  && !/<meta\s+content=["']no-referrer["']\s+name=["']referrer["']/i.test(root)) {
  throw new Error('Production RR9 no-referrer policy is missing');
}
console.log(headerCsp ? 'LIVE_SECURITY CSP_HEADER_PRESENT' : 'LIVE_SECURITY CSP_META_FALLBACK_PRESENT');

for (const route of ['search', 'subjects', 'collections', 'privacy', 'security', 'support', 'backup']) {
  await requireRoute(`${origin}/${route}/`);
}
const downloads = (await requireRoute(`${origin}/downloads/`)).toString('utf8');
if (!downloads.includes('Offline downloads') || !downloads.includes('data-offline-library')) {
  throw new Error('Production RR5 offline-download manager mismatch');
}

const releaseIdentityBytes = await requireRoute(`${origin}/release-identity.json`);
const releaseIdentity = JSON.parse(releaseIdentityBytes.toString('utf8'));
if (releaseIdentity.schemaVersion !== 1 || typeof releaseIdentity.sourceSha !== 'string') {
  throw new Error('Production release identity is invalid');
}
if (/^[a-f0-9]{40}$/i.test(expectedSourceSha) && releaseIdentity.sourceSha !== expectedSourceSha) {
  throw new Error(`Production source identity mismatch: expected ${expectedSourceSha}, live ${releaseIdentity.sourceSha}`);
}
console.log(`LIVE_SOURCE ${releaseIdentity.sourceSha}`);

const manifestBytes = await requireRoute(`${origin}/manifest.webmanifest`);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.id !== '/library/' || manifest.start_url !== '/library/' || manifest.scope !== '/library/' || manifest.display !== 'standalone') {
  throw new Error('Production manifest scope/install metadata mismatch');
}
if (!Array.isArray(manifest.icons) || !manifest.icons.some((icon) => icon.purpose === 'maskable')) {
  throw new Error('Production manifest is missing its maskable install icon');
}

const offlineAssetsBytes = await requireRoute(`${origin}/offline-assets.json`);
const offlineAssets = JSON.parse(offlineAssetsBytes.toString('utf8'));
if (offlineAssets.schemaVersion !== 1 || !Array.isArray(offlineAssets.assets) || !offlineAssets.assets.length) {
  throw new Error('Production RR5 offline application asset manifest is invalid');
}
if (!offlineAssets.assets.every((asset) => typeof asset === 'string' && asset.startsWith('/library/_astro/'))) {
  throw new Error('Production RR5 offline application asset manifest contains an unsupported path');
}
for (const asset of offlineAssets.assets.slice(0, 3)) await requireRoute(`https://thiepn.dev${asset}`);

const serviceWorker = (await requireRoute(`${origin}/service-worker.js`)).toString('utf8');
if (!serviceWorker.includes("const SW_VERSION = 'rr5-v1'")
  || !serviceWorker.includes("const CACHE_PREFIX = 'thiepn-library-pwa-'")
  || !serviceWorker.includes("const HOSTED_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1'")
  || !serviceWorker.includes("url.pathname.startsWith(scoped('media/'))")
  || !serviceWorker.includes('/\\.epub$/i.test(url.pathname)')
  || !serviceWorker.includes('/\\.pdf$/i.test(url.pathname)')
  || !serviceWorker.includes("data.type === 'CACHE_OFFLINE_PUBLICATION'")
  || !serviceWorker.includes('async function rangedResponse')) {
  throw new Error('Production RR5 service-worker offline publication contract mismatch');
}

const offline = (await requireRoute(`${origin}/offline/`)).toString('utf8');
if (!offline.includes('You’re offline.')) throw new Error('Production offline fallback mismatch');

console.log('PRODUCTION_VERIFICATION_PASS');
