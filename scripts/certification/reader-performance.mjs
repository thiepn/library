import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/performance.ts',
  'src/lib/reader/progress-ux.ts',
  'src/lib/reader/search-engine.ts',
  'src/pages/works/[slug]/read/index.astro',
  'src/layouts/EpubReaderLayout.astro',
  'src/lib/reader/fallback-harness.ts',
  'src/lib/reader/canonical.ts',
  'src/lib/reader/index.ts',
  'docs/READER_PERFORMANCE_P27.md',
  'scripts/certification/reader-performance.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_PERFORMANCE_P27', present, 'P27 scheduler, bootstrap, preload, search yielding, canonical reader path, local evidence, documentation, and permanent certification are present');

if (present) {
  const [performanceSource, progressUx, searchEngine, launcher, layout, fallbackHarness, canonical, index, pkg] = await Promise.all([
    readFile('src/lib/reader/performance.ts', 'utf8'),
    readFile('src/lib/reader/progress-ux.ts', 'utf8'),
    readFile('src/lib/reader/search-engine.ts', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/reader/fallback-harness.ts', 'utf8'),
    readFile('src/lib/reader/canonical.ts', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'EPUB_READER_PERFORMANCE_SHELL_FIRST',
    launcher.includes('async function bootNativeReader(publication: ReaderPublicationCandidate)')
      && launcher.includes("await import('../../../../lib/reader/fallback-harness')")
      && launcher.includes('requestAnimationFrame(() => {')
      && launcher.includes('readerPerformance?.markShellPainted();')
      && launcher.includes('void bootNativeReader(publication);'),
    'The public route gives the static reader shell a paint opportunity before invoking the function that requests the complete native-reader module',
  );

  pass(
    'EPUB_READER_PERFORMANCE_DIRECT_BOOTSTRAP',
    launcher.includes("from '../../../../lib/reader/fallback'")
      && launcher.includes("from '../../../../lib/reader/performance'")
      && launcher.includes("from '../../../../lib/reader/shell'")
      && !launcher.includes("from '../../../../lib/reader';"),
    'The startup bundle uses direct small bootstrap imports instead of pulling the reader barrel into the first route chunk',
  );

  pass(
    'EPUB_READER_PERFORMANCE_PRELOAD',
    layout.includes('epubHref?: string')
      && layout.includes('rel="preload"')
      && layout.includes('as="fetch"')
      && layout.includes('type="application/epub+zip"')
      && layout.includes('fetchpriority="high"')
      && launcher.includes('epubHref={publication.epub.url}'),
    'The exact localized active EPUB starts preloading in parallel with shell-first reader bootstrap',
  );

  pass(
    'EPUB_READER_PERFORMANCE_IDLE_SCHEDULER',
    performanceSource.includes('export function scheduleReaderIdleTask')
      && performanceSource.includes('requestIdleCallback')
      && performanceSource.includes("document.visibilityState === 'hidden'")
      && performanceSource.includes("document.addEventListener('visibilitychange'")
      && performanceSource.includes('cancelIdleCallback')
      && performanceSource.includes('window.setTimeout'),
    'Non-critical reader work uses cancellable browser-idle scheduling, waits while hidden, and retains a bounded compatibility fallback',
  );

  pass(
    'EPUB_READER_PERFORMANCE_LOCATION_MAP_IDLE',
    progressUx.includes("import { scheduleReaderIdleTask } from './performance';")
      && progressUx.includes('this.cancelGeneration = scheduleReaderIdleTask')
      && progressUx.includes('visibleOnly: true')
      && progressUx.includes("this.setMapStatus('idle')")
      && progressUx.includes("this.setMapStatus('generating')")
      && progressUx.includes('this.cancelGeneration?.()'),
    'Whole-book location-map generation is deferred until idle/visible time and pending generation is cancelled on teardown or cache acceptance',
  );

  pass(
    'EPUB_READER_PERFORMANCE_LOCATION_CACHE_FIRST',
    progressUx.indexOf('const cached = await this.cache.get(this.identity)') >= 0
      && progressUx.indexOf('const cached = await this.cache.get(this.identity)') < progressUx.indexOf('this.scheduleGeneration()'),
    'Exact-release cached location maps are attempted before any expensive regeneration is scheduled',
  );

  pass(
    'EPUB_READER_PERFORMANCE_SEARCH_COOPERATIVE',
    searchEngine.includes("import { yieldReaderMainThread } from './performance';")
      && searchEngine.includes('const yieldBoundary = scannedSections % yieldEverySections === 0')
      && searchEngine.includes('if (finished || yieldBoundary)')
      && searchEngine.includes('await yieldReaderMainThread(signal)')
      && searchEngine.includes('assertNotAborted(signal);'),
    'Whole-book search batches progress updates and cooperatively yields the main thread with cancellation checks',
  );

  pass(
    'EPUB_READER_PERFORMANCE_SEARCH_LAZY',
    searchEngine.includes('private book: Book | undefined')
      && searchEngine.includes('const book = await this.requireBook()')
      && searchEngine.includes('const book = ePub(this.source)')
      && searchEngine.indexOf('const book = ePub(this.source)') > searchEngine.indexOf('private async requireBook()'),
    'The search-only EPUB is still opened lazily on an actual search instead of during reader startup',
  );

  pass(
    'EPUB_READER_PERFORMANCE_LOCAL_EVIDENCE',
    performanceSource.includes('export class ReaderPerformanceController')
      && performanceSource.includes("safeMark('boot-start')")
      && performanceSource.includes("safeMark('shell-painted')")
      && performanceSource.includes("safeMark('first-ready')")
      && performanceSource.includes("safeMeasure('boot', 'boot-start', 'first-ready')")
      && performanceSource.includes('PerformanceObserver.supportedEntryTypes')
      && performanceSource.includes('readerBootMs')
      && performanceSource.includes('readerLongTasks'),
    'Boot milestones and supported Long Task evidence remain inspectable locally through Performance API marks and reader data attributes',
  );

  pass(
    'EPUB_READER_PERFORMANCE_NO_TELEMETRY',
    !performanceSource.includes('fetch(')
      && !performanceSource.includes('sendBeacon')
      && !performanceSource.includes('XMLHttpRequest')
      && !performanceSource.includes('WebSocket')
      && !performanceSource.includes('localStorage'),
    'P27 performance evidence is local-only and does not add analytics, upload, or persistent tracking',
  );

  pass(
    'EPUB_READER_PERFORMANCE_P26_PRESERVED',
    launcher.includes('mountReaderPublicationWithFallbackHarness(root, publication)')
      && fallbackHarness.includes('mountCanonicalEpubReader(')
      && canonical.includes('mountReaderShellWithCompatibilityHarness')
      && launcher.includes('showBootstrapFailure')
      && launcher.includes('location.reload()'),
    'Code splitting still enters through the P26 recovery wrapper and ER3 canonical boundary, preserving the complete P24 stack plus bootstrap recovery',
  );

  const forbiddenTitles = ['ai-for-the-kingdom', 'how-to-love-god', 'the-unfinished-mission'];
  pass(
    'EPUB_READER_PERFORMANCE_GENERIC',
    forbiddenTitles.every((title) => !performanceSource.includes(title))
      && forbiddenTitles.every((title) => !progressUx.includes(title))
      && forbiddenTitles.every((title) => !launcher.includes(title)),
    'P27 scheduling and loading behavior contains no current-title-specific exceptions',
  );

  pass(
    'EPUB_READER_PERFORMANCE_PUBLIC_API',
    index.includes('ReaderPerformanceController, scheduleReaderIdleTask, yieldReaderMainThread')
      && index.includes("ReaderIdleTaskOptions, ReaderLoadPhase, ReaderPerformanceState"),
    'Performance primitives and state types are exported through the stable reader API',
  );

  pass(
    'EPUB_READER_PERFORMANCE_CERT_CHAIN',
    pkg.includes('reader-fallback.mjs && node scripts/certification/reader-performance.mjs'),
    'P27 permanent certification is chained immediately after the P26 fallback gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_PERFORMANCE_SOURCE_PASS');
