import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/source.ts',
  'src/lib/reader/canonical.ts',
  'src/lib/reader/fallback-harness.ts',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/personal/read.astro',
  'src/lib/reader/index.ts',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_ER3_FILES', present, 'ER3 pure source/identity boundary, canonical browser mount, shared fallback runtime, hosted route, personal route, and public API are present');

if (present) {
  const source = await readFile('src/lib/reader/source.ts', 'utf8');
  const canonical = await readFile('src/lib/reader/canonical.ts', 'utf8');
  const fallback = await readFile('src/lib/reader/fallback-harness.ts', 'utf8');
  const hosted = await readFile('src/pages/works/[slug]/read/index.astro', 'utf8');
  const personal = await readFile('src/pages/personal/read.astro', 'utf8');
  const index = await readFile('src/lib/reader/index.ts', 'utf8');

  pass(
    'EPUB_READER_ER3_SOURCE_NEUTRAL',
    source.includes('source: string | ArrayBuffer')
      && source.includes('identity: ReaderAnnotationIdentity')
      && source.includes('readerCanonicalCandidateFromPublication'),
    'Hosted URLs and local ArrayBuffers are represented by one pure source-neutral EPUB candidate with exact-release identity',
  );

  pass(
    'EPUB_READER_ER3_SOURCE_PURE',
    !source.includes("from './compatibility-harness'")
      && !source.includes("from 'epubjs'")
      && !source.includes('.css')
      && !source.includes('document.')
      && !source.includes('window.'),
    'Source/identity conversion is independently testable without loading DOM, EPUB engine, or reader styles',
  );

  pass(
    'EPUB_READER_ER3_COMPLETE_STACK',
    canonical.includes('mountReaderShellWithCompatibilityHarness')
      && canonical.includes('candidate.source')
      && canonical.includes('candidate.identity'),
    'The canonical browser mount enters the complete compatibility harness rather than a reduced reader shell',
  );

  pass(
    'EPUB_READER_ER3_SHARED_RECOVERY',
    fallback.includes('class ReaderSourceFallbackController')
      && fallback.includes('mountCanonicalEpubReader(')
      && fallback.includes('new ReaderSourceFallbackController(')
      && fallback.includes('mountReaderSourceWithFallbackHarness'),
    'Source-neutral boot, retry, cleanup, and failure presentation are owned by one shared recovery controller',
  );

  pass(
    'EPUB_READER_ER3_HOSTED_ADAPTER',
    source.includes('source: publication.epub.url')
      && source.includes('workId: publication.workId')
      && source.includes('edition: publication.edition')
      && source.includes('releaseVersion: publication.version')
      && fallback.includes('readerCanonicalCandidateFromPublication(publication)')
      && hosted.includes('mountReaderPublicationWithFallbackHarness(root, publication)'),
    'Hosted immutable publications adapt into the canonical source contract without changing exact release identity',
  );

  pass(
    'EPUB_READER_ER3_PERSONAL_ADAPTER',
    personal.includes('const source = await book.file.arrayBuffer()')
      && personal.includes('mountReaderSourceWithFallbackHarness(root, {')
      && personal.includes('workId: personalReaderWorkId(book)')
      && personal.includes('releaseVersion: personalReaderReleaseVersion(book)')
      && !personal.includes('mountReaderShellHarness('),
    'Personal EPUBs use the same canonical fallback stack with their content-bound identity instead of the ER2 lightweight harness',
  );

  pass(
    'EPUB_READER_ER3_FEATURE_PARITY',
    canonical.includes('mountReaderShellWithCompatibilityHarness')
      && !personal.includes('mountReaderShellWithCompatibilityHarness')
      && !personal.includes('mountReaderShellWithAnnotationsHarness')
      && !personal.includes('mountReaderShellWithBookmarksHarness'),
    'Feature parity is inherited from one complete stack rather than manually duplicating TOC/search/bookmark/annotation controllers in the personal route',
  );

  pass(
    'EPUB_READER_ER3_PERFORMANCE_PARITY',
    hosted.includes('new ReaderPerformanceController(root)')
      && hosted.includes('readerPerformance?.markShellPainted()')
      && hosted.includes('readerPerformance?.markModuleLoading()')
      && hosted.includes('readerPerformance?.markOpening()')
      && personal.includes('new ReaderPerformanceController(root)')
      && personal.includes('readerPerformance?.markShellPainted()')
      && personal.includes('readerPerformance?.markModuleLoading()')
      && personal.includes('readerPerformance?.markOpening()'),
    'Hosted and personal public routes use the same reader performance phase instrumentation',
  );

  pass(
    'EPUB_READER_ER3_LIFECYCLE_PARITY',
    hosted.includes("window.addEventListener('pagehide'")
      && hosted.includes('mounted?.destroy()')
      && hosted.includes('readerPerformance?.destroy()')
      && personal.includes("window.addEventListener('pagehide'")
      && personal.includes('mounted?.destroy()')
      && personal.includes('readerPerformance?.destroy()'),
    'Both public EPUB routes explicitly destroy reader and performance runtime on page lifecycle exit',
  );

  pass(
    'EPUB_READER_ER3_BOOTSTRAP_RECOVERY_PARITY',
    hosted.includes("retry.textContent = 'Reload page'")
      && hosted.includes('location.reload()')
      && personal.includes("retry.textContent = 'Reload page'")
      && personal.includes('location.reload()')
      && personal.includes('root.removeEventListener(\'click\', bootstrapRetry)'),
    'Failures before the shared runtime mounts retain a working reload recovery action on both hosted and personal routes',
  );

  pass(
    'EPUB_READER_ER3_HOSTED_OFFLINE_PRESERVED',
    hosted.includes('cacheReaderPublicationForOffline(publication.epub.url)')
      && !personal.includes('cacheReaderPublicationForOffline'),
    'Hosted publication offline caching remains transport-specific while personal EPUB bytes stay in their local IndexedDB source',
  );

  pass(
    'EPUB_READER_ER3_API',
    index.includes('mountCanonicalEpubReader')
      && index.includes('readerCanonicalCandidateFromPublication')
      && index.includes('ReaderSourceFallbackController')
      && index.includes('mountReaderSourceWithFallbackHarness')
      && index.includes('ReaderCanonicalEpubCandidate'),
    'The consolidated source contract and shared recovery entrypoint are exported through the reader API',
  );

  pass(
    'EPUB_READER_ER3_NO_SOURCE_UPLOAD',
    !canonical.includes('fetch(candidate.source')
      && !fallback.includes('fetch(this.candidate')
      && !personal.includes('FormData')
      && !personal.includes('XMLHttpRequest'),
    'Consolidation does not introduce an upload/network detour for browser-local EPUB bytes',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_CONSOLIDATION_SOURCE_PASS');
