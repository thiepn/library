import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR5_OFFLINE_STORAGE_RELIABILITY.md',
  'src/lib/client/offline-library.ts',
  'src/lib/client/storage-reliability.ts',
  'src/lib/client/pwa.ts',
  'src/lib/client/personal-books.ts',
  'src/components/OfflineLibraryManager.astro',
  'src/pages/downloads.astro',
  'src/pages/saved.astro',
  'public/service-worker.js',
  'scripts/prepare-deploy.mjs',
  'scripts/certification/post-build.mjs',
  'scripts/verify-production.mjs',
  'tests/e2e/offline-fixtures.ts',
  'tests/e2e/offline-reliability.spec.ts',
  'tests/e2e/storage-reliability.spec.ts',
  'playwright.config.ts',
  'playwright.offline.config.ts',
  '.github/workflows/offline-reliability.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR5_FILES', present, 'RR5 offline manager, worker protocol, storage hardening, browser corpus, workflow, docs, post-build/live verification, and production gate are present');

if (present) {
  const [doc, offlineClient, storage, pwa, personal, manager, downloadsPage, saved, sw, prepare, postbuild, verifier, fixtures, offlineTests, storageTests, baselineConfig, config, workflow, deployment, pkg] = await Promise.all([
    readFile('docs/RR5_OFFLINE_STORAGE_RELIABILITY.md', 'utf8'),
    readFile('src/lib/client/offline-library.ts', 'utf8'),
    readFile('src/lib/client/storage-reliability.ts', 'utf8'),
    readFile('src/lib/client/pwa.ts', 'utf8'),
    readFile('src/lib/client/personal-books.ts', 'utf8'),
    readFile('src/components/OfflineLibraryManager.astro', 'utf8'),
    readFile('src/pages/downloads.astro', 'utf8'),
    readFile('src/pages/saved.astro', 'utf8'),
    readFile('public/service-worker.js', 'utf8'),
    readFile('scripts/prepare-deploy.mjs', 'utf8'),
    readFile('scripts/certification/post-build.mjs', 'utf8'),
    readFile('scripts/verify-production.mjs', 'utf8'),
    readFile('tests/e2e/offline-fixtures.ts', 'utf8'),
    readFile('tests/e2e/offline-reliability.spec.ts', 'utf8'),
    readFile('tests/e2e/storage-reliability.spec.ts', 'utf8'),
    readFile('playwright.config.ts', 'utf8'),
    readFile('playwright.offline.config.ts', 'utf8'),
    readFile('.github/workflows/offline-reliability.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR5_EXPLICIT_HOSTED_DOWNLOADS',
    offlineClient.includes("type: 'CACHE_OFFLINE_PUBLICATION'")
      && offlineClient.includes("type: 'CANCEL_OFFLINE_DOWNLOAD'")
      && offlineClient.includes("'LIST_OFFLINE_PUBLICATIONS'")
      && offlineClient.includes("'REMOVE_OFFLINE_PUBLICATION'")
      && manager.includes('Download ${artifact.format.toUpperCase()}')
      && manager.includes('Remove download')
      && manager.includes("button.textContent = 'Cancel'")
      && !pwa.includes("type: 'CACHE_READER_EPUB'"),
    'Hosted EPUB/PDF caching is explicit, inspectable, cancellable, removable, and no longer triggered automatically by opening a reader');

  pass('RR5_INVENTORY_QUOTA_PROGRESS',
    manager.includes('data-offline-storage')
      && manager.includes('getOfflineStorageEstimate')
      && manager.includes('progress.loadedBytes / progress.totalBytes')
      && manager.includes('Not enough browser storage')
      && sw.includes("type: 'OFFLINE_PROGRESS'")
      && sw.includes('x-thiepn-library-size'),
    'Offline UI exposes inventory truth, size, transfer progress, cancellation state, and quota guidance');

  pass('RR5_STABLE_PUBLICATION_CACHE',
    sw.includes("const HOSTED_PUBLICATION_CACHE = 'thiepn-library-offline-publications-v1'")
      && sw.includes("const CACHE_PREFIX = 'thiepn-library-pwa-'")
      && !sw.includes("HOSTED_PUBLICATION_CACHE = `${CACHE_PREFIX}")
      && sw.includes('LEGACY_PUBLICATION_CACHES')
      && sw.includes('migrateLegacyPublicationCaches()')
      && sw.includes('!LEGACY_PUBLICATION_CACHES.has(key)'),
    'Hosted publication data uses a rollback-safe stable namespace, migrates legacy EPUBs, preserves the legacy publication cache, and still cleans stale versioned runtime caches');

  pass('RR5_PDF_RANGE_OFFLINE',
    sw.includes('async function rangedResponse')
      && sw.includes("status: 206")
      && sw.includes("headers.set('Content-Range'")
      && sw.includes("request.headers.get('range')")
      && offlineTests.includes('cached byte-range support'),
    'Complete explicit PDF downloads serve bounded cached byte ranges to PDF.js while offline');

  pass('RR5_READER_RUNTIME_OFFLINE',
    prepare.includes("offline-assets.json")
      && prepare.includes("path.join(libraryRoot, '_astro')")
      && sw.includes('cacheOfflineApplicationAssets()')
      && sw.includes('cacheOfflineReaderDocument(rawReaderUrl)')
      && sw.includes('migrateRuntimeDocumentCaches()')
      && doc.includes('exact asset set plus the corresponding reader route'),
    'A completed publication download owns the reader route and hashed runtime, and versioned updates migrate cached reader documents before stale cleanup');

  pass('RR5_PERSONAL_IDB_ONLY',
    personal.includes("const PERSONAL_DB_NAME = 'thiepn-library-personal-books'")
      && storageTests.includes('never enter hosted service-worker publication cache')
      && !sw.includes('thiepn-library-personal-books')
      && !sw.includes('indexedDB')
      && doc.includes('never duplicated into the service-worker publication cache'),
    'Personal files remain IndexedDB-only and are not doubled in Cache Storage');

  const importStatusIndex = saved.indexOf("status.textContent = parts.join(' · ');");
  const offlinePrepIndex = saved.indexOf('prepareImportedReaders(readerRoutes);');
  pass('RR5_PERSONAL_OFFLINE_NONBLOCKING',
    saved.includes('data-personal-offline-status')
      && saved.includes('function prepareImportedReaders(readerRoutes: string[])')
      && saved.includes('void preparePersonalReadersForOffline(readerRoutes).then')
      && !saved.includes('await preparePersonalReadersForOffline(readerRoutes)')
      && importStatusIndex >= 0
      && offlinePrepIndex > importStatusIndex
      && storageTests.includes('2 readers ready for offline use.'),
    'Committed personal imports report success before optional offline reader preparation; RR5 readiness has its own live status and cannot consume RR4 import latency budgets');

  pass('RR5_STORAGE_FAILURES',
    storage.includes("name === 'QuotaExceededError'")
      && storage.includes("name === 'SecurityError'")
      && storage.includes("name === 'AbortError'")
      && storage.includes("'blocked'")
      && storageTests.includes('quota exhaustion')
      && storageTests.includes('interrupted write')
      && storageTests.includes('denied IndexedDB')
      && storageTests.includes('blocked v1 personal storage'),
    'Quota, denial/private-session style failure, interruption, and blocked upgrade states are normalized and exercised');

  pass('RR5_PERSONAL_UPGRADE',
    personal.includes('const PERSONAL_DB_VERSION = 2')
      && personal.includes("db.addEventListener('versionchange', () => db.close())")
      && storageTests.includes("indexedDB.open(dbName, 1)")
      && storageTests.includes('RR5 v1 preserved'),
    'Personal-book v1→v2 upgrade closes version-changed connections and preserves an authoritative v1 record');

  pass('RR5_EVICTION_PRIVATE_BOUNDARY',
    offlineTests.includes("caches.delete(cacheName)")
      && offlineTests.includes('No hosted publication files')
      && storageTests.includes('private-style ephemeral browser context')
      && storageTests.includes('does not persist personal books into a later session'),
    'Deterministic eviction and ephemeral/private-style session boundaries are explicitly exercised without claiming physical private-window certification');

  pass('RR5_UPDATE_ROLLBACK',
    pwa.includes("setWorkerState('update-ready')")
      && pwa.includes('activateWaitingLibraryWorker')
      && sw.includes("data.type === 'SKIP_WAITING'")
      && sw.includes('function isReaderDocumentUrl')
      && sw.includes('async function migrateRuntimeDocumentCaches()')
      && sw.includes('await migrateRuntimeDocumentCaches()')
      && manager.includes('Update and reload')
      && offlineTests.includes('waiting worker preserves active controller, reader routes, cache migration, and rollback')
      && offlineTests.includes('staleMarkerAbsent')
      && offlineTests.includes('service-worker-next.js')
      && offlineTests.includes("register('/library/service-worker.js'")
      && !sw.includes('self.skipWaiting();\n});'),
    'Waiting workers remain user-activated, only reader routes migrate before stale cleanup, and update/rollback offline continuity is browser-tested');

  pass('RR5_CROSS_ENGINE_PROFILE',
    config.includes("name: 'chromium-offline'")
      && config.includes("name: 'firefox-offline'")
      && config.includes("name: 'webkit-offline'")
      && config.includes("serviceWorkers: 'allow'")
      && config.includes("'**/offline-reliability.spec.ts'")
      && config.includes("'**/storage-reliability.spec.ts'"),
    'RR5 has a service-worker-enabled Chromium/Firefox/WebKit browser profile; lifecycle-only checks are explicitly sampled once where appropriate');

  pass('RR5_BROWSER_CONFIG_ISOLATION',
    baselineConfig.includes("serviceWorkers: 'block'")
      && baselineConfig.includes("testIgnore: ['**/offline-reliability.spec.ts', '**/storage-reliability.spec.ts']")
      && config.includes("serviceWorkers: 'allow'"),
    'Service-worker-required RR5 journeys run only in the dedicated allow-enabled profile and cannot time out inside the blocked baseline browser matrix');

  pass('RR5_DETERMINISTIC_FIXTURES',
    fixtures.includes('RR5 OFFLINE EPUB MARKER')
      && fixtures.includes('buildOfflinePdf')
      && fixtures.includes('service-worker-next.js')
      && fixtures.includes('RR5_USE_SYNTHETIC_MEDIA')
      && fixtures.includes('src/publications/releases')
      && workflow.includes("RR5_USE_SYNTHETIC_MEDIA: '1'")
      && !deployment.includes('RR5_USE_SYNTHETIC_MEDIA')
      && !fixtures.includes('https://example.com'),
    'Synthetic publication bytes are qualification-only; production RR5 reuses integrity-verified staged R2 media and never overwrites it');

  pass('RR5_WORKFLOW',
    workflow.includes('name: Offline Reliability')
      && workflow.includes('cancel-in-progress: true')
      && workflow.includes('rr5-offline-${{ github.event.pull_request.head.ref || github.ref_name }}')
      && workflow.includes('pnpm certify:offline-reliability')
      && workflow.includes('playwright install --with-deps chromium firefox webkit')
      && workflow.includes('pnpm build')
      && workflow.includes('pnpm test:offline')
      && workflow.includes('playwright-offline-report'),
    'RR5 has a dedicated source-certified cross-engine workflow that cancels superseded branch matrices and retains failure evidence');

  const browserIndex = deployment.indexOf('id: browser');
  const performanceIndex = deployment.indexOf('id: performance');
  const offlineIndex = deployment.indexOf('id: offline');
  const pagesIndex = deployment.indexOf('actions/upload-pages-artifact@v4');
  pass('RR5_PRODUCTION_GATE',
    deployment.includes('Run RR5 offline, PWA, update, and storage reliability')
      && deployment.includes('run: pnpm test:offline')
      && deployment.includes("if: failure() && steps.offline.outcome == 'failure'")
      && deployment.includes('RR5 offline/PWA/storage reliability before artifact upload')
      && browserIndex >= 0
      && performanceIndex > browserIndex
      && offlineIndex > performanceIndex
      && pagesIndex > offlineIndex,
    'Production artifact upload is ordered after browser acceptance, RR4 performance, and RR5 offline/storage reliability and records the outcome');

  pass('RR5_BUILD_LIVE_VERIFY',
    postbuild.includes("'dist/library/downloads/index.html'")
      && postbuild.includes("'dist/library/offline-assets.json'")
      && postbuild.includes("const SW_VERSION = 'rr5-v1'")
      && verifier.includes('`${origin}/downloads/`')
      && verifier.includes('`${origin}/offline-assets.json`')
      && verifier.includes("const SW_VERSION = 'rr5-v1'"),
    'Post-build and live production verification require the RR5 manager, offline asset manifest, and exact service-worker contract');

  pass('RR5_PACKAGE_COMMANDS',
    pkg.includes('"test:offline": "playwright test --config=playwright.offline.config.ts"')
      && pkg.includes('"certify:offline-reliability": "node scripts/certification/offline-reliability.mjs"')
      && pkg.includes('node scripts/certification/performance-budget.mjs')
      && pkg.indexOf('node scripts/certification/offline-reliability.mjs') > pkg.indexOf('node scripts/certification/performance-budget.mjs'),
    'RR5 exposes stable commands and permanent source certification after the RR4 performance gate');

  pass('RR5_DOCUMENTED_LIMITS',
    doc.includes('does not claim that browser storage is archival')
      && doc.includes('do not substitute for RR2 physical')
      && downloadsPage.includes('OfflineLibraryManager'),
    'RR5 documents eviction/evidence limits honestly and exposes the user-facing manager through a dedicated page');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('RR5_OFFLINE_STORAGE_RELIABILITY_SOURCE_PASS');
