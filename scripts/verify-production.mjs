import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const origin = 'https://thiepn.dev/library';
const worksRoot = path.join(process.cwd(), 'src/content/works');
const releasesRoot = path.join(process.cwd(), 'src/publications/releases');

async function fetchResponse(url) {
  let last;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
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

function requireHeader(response, name, expected) {
  const value = response.headers.get(name) ?? '';
  if (expected instanceof RegExp ? !expected.test(value) : value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Production security header mismatch: ${name}=${JSON.stringify(value)}`);
  }
  return value;
}

async function verifySecurityHeaders() {
  const response = await fetchResponse(`${origin}/`);
  requireHeader(response, 'strict-transport-security', /max-age=31536000/i);
  requireHeader(response, 'x-content-type-options', 'nosniff');
  requireHeader(response, 'x-frame-options', 'DENY');
  requireHeader(response, 'x-permitted-cross-domain-policies', 'none');
  requireHeader(response, 'cross-origin-opener-policy', 'same-origin');
  requireHeader(response, 'cross-origin-resource-policy', 'same-origin');
  requireHeader(response, 'origin-agent-cluster', '?1');
  const permissions = requireHeader(response, 'permissions-policy', /camera=\(\)/i);
  for (const permission of ['microphone=()', 'geolocation=()', 'payment=()', 'usb=()']) {
    if (!permissions.toLowerCase().includes(permission)) throw new Error(`Production Permissions-Policy is missing ${permission}.`);
  }
  const csp = requireHeader(response, 'content-security-policy', /default-src 'self'/i);
  const requiredCsp = [
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "manifest-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    'upgrade-insecure-requests',
  ];
  for (const directive of requiredCsp) {
    if (!csp.includes(directive)) throw new Error(`Production CSP is missing ${directive}.`);
  }

  const workerResponse = await fetchResponse(`${origin}/service-worker.js`);
  requireHeader(workerResponse, 'cache-control', /no-cache/i);
  requireHeader(workerResponse, 'service-worker-allowed', '/library/');
  console.log('LIVE_SECURITY_HEADERS_PASS');
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
await requireRoute(`${origin}/security`);
await requireRoute(`${origin}/privacy`);
await requireRoute(`${origin}/backup`);
const downloads = (await requireRoute(`${origin}/downloads/`)).toString('utf8');
if (!downloads.includes('Offline downloads') || !downloads.includes('data-offline-library')) {
  throw new Error('Production RR5 offline-download manager mismatch');
}

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

await verifySecurityHeaders();
console.log('PRODUCTION_VERIFICATION_PASS');
