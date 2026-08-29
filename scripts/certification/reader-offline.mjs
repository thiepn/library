import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'public/service-worker.js',
  'public/manifest.webmanifest',
  'public/app-icon.svg',
  'public/app-icon-maskable.svg',
  'src/lib/client/pwa.ts',
  'src/pages/offline.astro',
  'src/layouts/BaseLayout.astro',
  'src/layouts/EpubReaderLayout.astro',
  'src/pages/works/[slug]/read/index.astro',
  'docs/READER_OFFLINE_P28.md',
  'scripts/certification/reader-offline.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_OFFLINE_P28', present, 'P28 service-worker scope, manifest/install metadata, registration, fallback, reader integration, documentation, and certification foundation remain present');

if (present) {
  const [sw, manifestRaw, pwa, offline, baseLayout, readerLayout, launcher, headers, pkg, verifier, postbuild] = await Promise.all([
    readFile('public/service-worker.js', 'utf8'),
    readFile('public/manifest.webmanifest', 'utf8'),
    readFile('src/lib/client/pwa.ts', 'utf8'),
    readFile('src/pages/offline.astro', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('public/_headers', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('scripts/verify-production.mjs', 'utf8'),
    readFile('scripts/certification/post-build.mjs', 'utf8'),
  ]);
  const manifest = JSON.parse(manifestRaw);

  pass(
    'EPUB_READER_OFFLINE_SCOPE',
    manifest.id === '/library/'
      && manifest.start_url === '/library/'
      && manifest.scope === '/library/'
      && sw.includes('const scopeUrl = new URL(self.registration.scope)')
      && pwa.includes("scope: `${base}/`"),
    'Manifest, registration, and service-worker runtime remain constrained to the /library/ application scope',
  );

  pass(
    'EPUB_READER_OFFLINE_INSTALL_METADATA',
    manifest.display === 'standalone'
      && Array.isArray(manifest.icons)
      && manifest.icons.some((icon) => icon.purpose === 'any')
      && manifest.icons.some((icon) => icon.purpose === 'maskable')
      && baseLayout.includes('rel="manifest"')
      && readerLayout.includes('rel="manifest"')
      && baseLayout.includes('mobile-web-app-capable')
      && readerLayout.includes('mobile-web-app-capable'),
    'Catalog and native reader pages expose a standalone manifest with regular and maskable install icons',
  );

  pass(
    'EPUB_READER_OFFLINE_REGISTRATION',
    pwa.includes('export function registerLibraryPwa()')
      && pwa.includes("navigator.serviceWorker.register(`${base}/service-worker.js`")
      && pwa.includes("updateViaCache: 'none'")
      && baseLayout.includes('registerLibraryPwa')
      && readerLayout.includes('registerLibraryPwa'),
    'Both application layouts register the same no-cache service worker through one client bridge',
  );

  pass(
    'EPUB_READER_OFFLINE_NAVIGATION',
    sw.includes("if (request.mode === 'navigate')")
      && sw.includes('networkFirstNavigation(request)')
      && sw.includes('const cached = await caches.match(request)')
      && sw.includes('const offline = await caches.match(OFFLINE_URL)'),
    'Navigations prefer the network, replay exact visited pages offline, and otherwise fall back to the resilient offline document',
  );

  pass(
    'EPUB_READER_OFFLINE_FALLBACK_SELF_CONTAINED',
    offline.includes('<style is:inline>')
      && !offline.includes('BaseLayout')
      && !offline.includes('fonts.googleapis.com')
      && offline.includes('You’re offline.'),
    'Offline fallback remains self-contained and independent of the site bundle and third-party fonts',
  );

  pass(
    'EPUB_READER_OFFLINE_EXPLICIT_SUPERSESSION',
    sw.includes("url.pathname.startsWith(scoped('media/'))")
      && sw.includes('/\\.epub$/i.test(url.pathname)')
      && launcher.includes('cacheReaderPublicationForOffline(publication.epub.url)')
      && launcher.includes('if (handle.reader)')
      && pwa.includes('RR5 intentionally disables automatic publication caching')
      && pwa.includes('return false;')
      && !pwa.includes("type: 'CACHE_READER_EPUB'"),
    'The P28 reader compatibility call remains harmless while RR5 truthfully supersedes automatic EPUB warmup with explicit user-owned downloads',
  );

  pass(
    'EPUB_READER_OFFLINE_NO_PDF_AUTOCACHE',
    sw.includes("/\\.pdf$/i.test(url.pathname)")
      && !launcher.includes('cacheReaderPublicationForOffline(publication.pdf')
      && !pwa.includes('CACHE_READER_PDF'),
    'PDF artifacts are never automatically cached merely because a reader opens; RR5 owns explicit PDF download state',
  );

  pass(
    'EPUB_READER_OFFLINE_CROSS_ORIGIN_SAFE',
    sw.includes('url.origin === scopeUrl.origin')
      && sw.includes('if (!isSameOriginScoped(url)) return;')
      && sw.includes("if (request.method !== 'GET') return;")
      && sw.includes("request.headers.get('range')"),
    'Service-worker interception still rejects cross-origin and non-GET traffic; RR5 handles ranges only inside the validated hosted-publication path',
  );

  pass(
    'EPUB_READER_OFFLINE_FIRST_VISIT_WARMUP',
    pwa.includes('const hadController = Boolean(navigator.serviceWorker.controller)')
      && pwa.includes('navigator.serviceWorker.ready.then')
      && pwa.includes("type: 'CACHE_DOCUMENT_URLS'")
      && sw.includes("data.type === 'CACHE_DOCUMENT_URLS'")
      && /urls\.slice\(0,\s*(48|96)\)/.test(sw),
    'The first uncontrolled document and its already-loaded same-origin assets still receive bounded best-effort warmup after activation',
  );

  pass(
    'EPUB_READER_OFFLINE_UPDATE_SAFE',
    pwa.includes("setWorkerState('update-ready')")
      && pwa.includes('export async function activateWaitingLibraryWorker')
      && pwa.includes("registration.waiting.postMessage({ type: 'SKIP_WAITING' })")
      && sw.includes("data.type === 'SKIP_WAITING'")
      && !sw.includes("self.skipWaiting();\n});"),
    'Waiting service workers are surfaced but never activated automatically during an active reading session',
  );

  pass(
    'EPUB_READER_OFFLINE_CACHE_NAMESPACE',
    sw.includes("const CACHE_PREFIX = 'thiepn-library-pwa-'")
      && sw.includes('key.startsWith(CACHE_PREFIX)')
      && sw.includes('!OWN_CACHES.has(key)'),
    'Versioned PWA cache cleanup remains namespace-bounded; RR5 separately protects stable hosted-publication storage',
  );

  pass(
    'EPUB_READER_OFFLINE_NO_INDEXEDDB_MUTATION',
    !pwa.includes('indexedDB')
      && !sw.includes('indexedDB')
      && !pwa.includes('library-db')
      && !sw.includes('library-db'),
    'The PWA bridge and service worker still do not mutate reader progress, bookmarks, annotations, settings, or IndexedDB schemas',
  );

  pass(
    'EPUB_READER_OFFLINE_HEADERS',
    headers.includes('/library/service-worker.js')
      && headers.includes('Cache-Control: no-cache')
      && headers.includes('Service-Worker-Allowed: /library/')
      && headers.includes('/library/manifest.webmanifest'),
    'Deployment headers keep the worker and manifest revalidatable instead of pinning them as immutable assets',
  );

  pass(
    'EPUB_READER_OFFLINE_PRODUCTION_VERIFY',
    verifier.includes("`${origin}/manifest.webmanifest`")
      && verifier.includes("`${origin}/service-worker.js`")
      && verifier.includes("`${origin}/offline/`")
      && postbuild.includes("'dist/library/service-worker.js'")
      && postbuild.includes("'dist/library/manifest.webmanifest'")
      && postbuild.includes("'dist/library/offline/index.html'"),
    'Post-build and production verification still require the foundational worker, manifest, and offline fallback',
  );

  const forbiddenTitles = ['ai-for-the-kingdom', 'how-to-love-god', 'the-unfinished-mission'];
  pass(
    'EPUB_READER_OFFLINE_GENERIC',
    forbiddenTitles.every((title) => !sw.includes(title))
      && forbiddenTitles.every((title) => !pwa.includes(title))
      && forbiddenTitles.every((title) => !launcher.includes(title)),
    'Offline and PWA behavior contains no current-title-specific routing or cache exceptions',
  );

  pass(
    'EPUB_READER_OFFLINE_P27_PRESERVED',
    readerLayout.includes('rel="preload"')
      && readerLayout.includes('type="application/epub+zip"')
      && launcher.includes("await import('../../../../lib/reader/fallback-harness')")
      && launcher.includes('ReaderPerformanceController'),
    'RR5 keeps P27 shell-first bootstrap, EPUB preload, performance evidence, and P26 recovery path intact',
  );

  pass(
    'EPUB_READER_OFFLINE_CERT_CHAIN',
    pkg.includes('reader-performance.mjs && node scripts/certification/reader-offline.mjs'),
    'The P28 foundation remains permanently certified immediately after the P27 performance source gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_OFFLINE_SOURCE_PASS');
