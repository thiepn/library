import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const origin = 'https://thiepn.dev/library';
const worksRoot = path.join(process.cwd(), 'src/content/works');
const releasesRoot = path.join(process.cwd(), 'src/publications/releases');
const expectedSourceSha = process.env.EXPECTED_SOURCE_SHA ?? process.env.GITHUB_SHA ?? '';
const accountPublishableKey = process.env.PUBLIC_THIEPN_ACCOUNT_PUBLISHABLE_KEY ?? '';
const accountProjectUrl = 'https://hycegznamzjhwinegaai.supabase.co';
const accountIssuer = `${accountProjectUrl}/auth/v1`;
const accountDiscoveryUrl = `${accountProjectUrl}/.well-known/oauth-authorization-server/auth/v1`;
const libraryOAuthClientId = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';
const libraryOAuthCallback = 'https://thiepn.dev/library/auth/callback/';

if (!accountPublishableKey.trim()) {
  throw new Error('THIEPN Account publishable key is missing from production verification');
}

async function fetchResponse(url, init = {}) {
  let last;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const response = await fetch(url, { redirect: 'follow', cache: 'no-store', ...init });
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
const metaTag = root.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0];
const metaCsp = metaTag?.match(/\bcontent="([^"]*)"/i)?.[1]
  ?? metaTag?.match(/\bcontent='([^']*)'/i)?.[1];
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

const account = (await requireRoute(`${origin}/account/`)).toString('utf8');
if (!account.includes('THIEPN Account') || !account.includes('Sync this device')) {
  throw new Error('Production THIEPN Account page is missing its sign-in/sync contract');
}
await requireRoute(`${origin}/auth/callback/`);

const discoveryResponse = await fetchResponse(accountDiscoveryUrl);
const discovery = await discoveryResponse.json();
if (!discovery || typeof discovery !== 'object') {
  throw new Error('THIEPN Account OAuth discovery response is invalid');
}
if (discovery.issuer !== accountIssuer
  || discovery.authorization_endpoint !== `${accountIssuer}/oauth/authorize`
  || discovery.token_endpoint !== `${accountIssuer}/oauth/token`
  || !Array.isArray(discovery.code_challenge_methods_supported)
  || !discovery.code_challenge_methods_supported.includes('S256')
  || !Array.isArray(discovery.grant_types_supported)
  || !discovery.grant_types_supported.includes('authorization_code')
  || !discovery.grant_types_supported.includes('refresh_token')
  || !Array.isArray(discovery.token_endpoint_auth_methods_supported)
  || !discovery.token_endpoint_auth_methods_supported.includes('none')) {
  throw new Error('THIEPN Account OAuth server does not satisfy the Library public-client contract');
}

const authorizeUrl = new URL(discovery.authorization_endpoint);
authorizeUrl.searchParams.set('response_type', 'code');
authorizeUrl.searchParams.set('client_id', libraryOAuthClientId);
authorizeUrl.searchParams.set('redirect_uri', libraryOAuthCallback);
authorizeUrl.searchParams.set('scope', 'email profile offline_access');
authorizeUrl.searchParams.set('state', 'B'.repeat(43));
authorizeUrl.searchParams.set('code_challenge', 'A'.repeat(43));
authorizeUrl.searchParams.set('code_challenge_method', 'S256');

let authorizationResponse;
let authorizationError;
for (let attempt = 1; attempt <= 8; attempt++) {
  try {
    authorizationResponse = await fetch(authorizeUrl, {
      redirect: 'manual',
      cache: 'no-store',
    });
    if ([301, 302, 303, 307, 308].includes(authorizationResponse.status)) break;
    throw new Error(`unexpected authorization status ${authorizationResponse.status}`);
  } catch (error) {
    authorizationError = error;
    authorizationResponse = undefined;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
if (!authorizationResponse) throw authorizationError ?? new Error('THIEPN Account authorization request failed');
const authorizationLocation = authorizationResponse.headers.get('location');
if (!authorizationLocation) throw new Error('THIEPN Account authorization response is missing its redirect');
const consentUrl = new URL(authorizationLocation);
if (consentUrl.origin !== 'https://account.thiepn.dev'
  || consentUrl.pathname.replace(/\/$/, '') !== '/oauth/consent'
  || !consentUrl.searchParams.get('authorization_id')) {
  throw new Error(`THIEPN Account authorization redirect mismatch: ${authorizationLocation}`);
}
console.log('LIVE_ACCOUNT THIEPN_ACCOUNT_SSO_READY');

const authSettingsResponse = await fetchResponse(`${accountProjectUrl}/auth/v1/settings`, {
  headers: { apikey: accountPublishableKey },
});
const authSettings = await authSettingsResponse.json();
if (!authSettings || typeof authSettings !== 'object' || typeof authSettings.external !== 'object') {
  throw new Error('THIEPN Account auth settings response is invalid');
}
if (authSettings.external.google !== true) {
  throw new Error('THIEPN Account Google OAuth is not enabled');
}
console.log('LIVE_ACCOUNT THIEPN_ACCOUNT_AUTH_READY');
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
