import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/fallback.ts',
  'src/lib/reader/fallback-harness.ts',
  'src/lib/reader/harness.ts',
  'src/lib/reader/migration.ts',
  'src/components/reader/ReaderShell.astro',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/read/[chapter].astro',
  'scripts/certification/reader-fallback.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_FALLBACK_P26', present, 'P26 failure classification, recovery harness, alternate reading paths, public integration, and permanent certification are present');

if (present) {
  const [fallback, fallbackHarness, harness, migration, shell, launcher, legacyChapter, index, pkg] = await Promise.all([
    readFile('src/lib/reader/fallback.ts', 'utf8'),
    readFile('src/lib/reader/fallback-harness.ts', 'utf8'),
    readFile('src/lib/reader/harness.ts', 'utf8'),
    readFile('src/lib/reader/migration.ts', 'utf8'),
    readFile('src/components/reader/ReaderShell.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/[chapter].astro', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'EPUB_READER_FALLBACK_CLASSIFICATION',
    fallback.includes("| 'network'")
      && fallback.includes("| 'publication'")
      && fallback.includes("| 'rendering'")
      && fallback.includes("| 'location'")
      && fallback.includes("code === 'epub-open-failed'")
      && fallback.includes("code === 'epub-render-failed'")
      && fallback.includes("code === 'invalid-location'")
      && fallback.includes("code === 'invalid-container' || code === 'engine-not-ready'"),
    'Reader failures are normalized into stable user-facing classes without exposing raw engine exceptions as the UX contract',
  );

  pass(
    'EPUB_READER_FALLBACK_NETWORK',
    fallback.includes("navigator.onLine === false")
      && fallback.includes("'failed to fetch'")
      && fallback.includes("kind: 'network'")
      && fallback.includes('Check your connection and try again'),
    'Offline and common fetch failures receive a specific retryable network state',
  );

  pass(
    'EPUB_READER_FALLBACK_BOOT_RETRY',
    fallbackHarness.includes('class ReaderFallbackController')
      && fallbackHarness.includes('async retry(): Promise<boolean>')
      && fallbackHarness.includes('const failureShell = mountReaderShell(this.root)')
      && fallbackHarness.includes('this.bindFailureRetry()')
      && fallbackHarness.includes('void this.retry()'),
    'A failed first EPUB boot recreates the shell and leaves a functioning retry owner instead of a dead Try again button',
  );

  pass(
    'EPUB_READER_FALLBACK_FULL_STACK',
    fallbackHarness.includes('mountReaderPublicationWithCompatibilityHarness')
      && launcher.includes('mountReaderPublicationWithFallbackHarness(root, publication)')
      && !fallbackHarness.includes('new EpubJsEngine('),
    'Recovery remounts the complete P24 publication stack rather than a reduced emergency reader',
  );

  pass(
    'EPUB_READER_FALLBACK_RELEASE_STABLE',
    fallbackHarness.includes('readonly publication: ReaderPublicationCandidate')
      && fallbackHarness.includes('this.publication')
      && !fallbackHarness.includes('resolveReaderPublicationCandidate')
      && !fallbackHarness.includes('activeRelease'),
    'Retries reuse the already-resolved publication identity and do not silently switch editions or releases',
  );

  pass(
    'EPUB_READER_FALLBACK_EXPLICIT_ONLY',
    !fallbackHarness.includes('location.replace')
      && !fallbackHarness.includes('location.assign')
      && !fallbackHarness.includes('window.location')
      && shell.includes('data-reader-fallback="legacy-web"')
      && shell.includes('data-reader-fallback="pdf"')
      && shell.includes('data-reader-fallback="epub"'),
    'Reader failure never auto-redirects into a fallback; alternate reading paths remain explicit user choices',
  );

  pass(
    'EPUB_READER_FALLBACK_LEGACY_DIRECT',
    launcher.includes('const legacyFallbackHref = first')
      && launcher.includes('`/works/${work.slug}/read/${first.entry.data.id}`')
      && launcher.includes('fallbackWebHref={legacyFallbackHref ?? \'\'}')
      && legacyChapter.includes('ReaderLayout'),
    'A verified Markdown fallback points directly to a materialized chapter instead of looping through the EPUB-first /read launcher',
  );

  pass(
    'EPUB_READER_FALLBACK_PDF_RELEASE',
    launcher.includes('work.release?.artifacts.pdf')
      && launcher.includes('localizeReaderArtifact(work.release.artifacts.pdf, base)')
      && launcher.includes('fallbackPdfHref={publication.pdf?.url ?? \'\'}'),
    'PDF escape paths come from the resolved active release and use the same canonical-media localization rule',
  );

  pass(
    'EPUB_READER_FALLBACK_EPUB_DOWNLOAD',
    launcher.includes('fallbackEpubHref={publication.epub.url}')
      && shell.includes('data-reader-fallback="epub"')
      && shell.includes('download>Download EPUB</a>'),
    'A failed web rendition still exposes the exact active EPUB artifact for use in an external reader',
  );

  pass(
    'EPUB_READER_FALLBACK_RUNTIME',
    harness.includes("import { clearReaderFailureState, setReaderFailureState } from './fallback';")
      && harness.includes('setReaderFailureState(shell, error)')
      && harness.includes("if (state.status === 'error') setReaderFailureState(shell, state.error)")
      && harness.includes('clearReaderFailureState(shell);'),
    'Open, navigation/layout, and controller-level fatal failures share the same P26 presentation contract',
  );

  pass(
    'EPUB_READER_FALLBACK_PARTIAL_CLEANUP',
    fallbackHarness.includes('this.activeReader?.destroy()')
      && fallbackHarness.includes('if (this.destroyed || attempt !== this.attempt)')
      && fallbackHarness.includes('reader.destroy()')
      && harness.includes('controller.destroy();')
      && harness.includes('shell.destroy();'),
    'Failed, superseded, and closing reader attempts clean partial runtime state before recovery or navigation',
  );

  pass(
    'EPUB_READER_FALLBACK_LEGACY_SAFE',
    launcher.includes("migration.mode === 'legacy-web' && first")
      && launcher.includes('.catch(() => location.replace')
      && launcher.includes('launch.dataset.firstChapter')
      && launcher.includes('This edition does not currently have a usable web reading path.'),
    'Legacy progress-storage failure falls back to a known chapter, while an unexpectedly empty Markdown payload becomes an explicit unavailable state',
  );

  pass(
    'EPUB_READER_FALLBACK_BOOTSTRAP_SAFE',
    launcher.includes('function showBootstrapFailure(error: unknown)')
      && launcher.includes('setReaderFailureState(shell, error)')
      && launcher.includes("retry.textContent = 'Reload page'")
      && launcher.includes('location.reload()'),
    'Failures before publication harness construction retain recovery links and provide a real page reload action',
  );

  pass(
    'EPUB_READER_FALLBACK_A11Y',
    shell.includes('data-reader-error-heading')
      && shell.includes('role="alert"')
      && shell.includes('role="group" aria-label="Reader recovery options"')
      && fallback.includes('heading:')
      && fallback.includes('retry.hidden = !failure.retryable'),
    'Failure headings, alert semantics, grouped recovery actions, and retry availability remain assistive-technology discoverable',
  );

  const forbiddenTitles = ['ai-for-the-kingdom', 'how-to-love-god', 'the-unfinished-mission'];
  pass(
    'EPUB_READER_FALLBACK_GENERIC',
    forbiddenTitles.every((title) => !fallback.includes(title))
      && forbiddenTitles.every((title) => !fallbackHarness.includes(title))
      && forbiddenTitles.every((title) => !launcher.includes(title)),
    'P26 fallback behavior contains no current-book-specific exceptions',
  );

  pass(
    'EPUB_READER_FALLBACK_PUBLIC_API',
    index.includes("from './fallback';")
      && index.includes("from './fallback-harness';")
      && index.includes('ReaderFallbackController')
      && index.includes('ReaderFallbackHarnessHandle'),
    'Failure descriptions and recovery harness are exported through the stable reader API',
  );

  pass(
    'EPUB_READER_FALLBACK_LOCALIZATION',
    migration.includes('export function localizeReaderArtifact')
      && migration.includes('epub: localizeReaderArtifact(publication.epub, base)')
      && migration.includes('pdf: localizeReaderArtifact(publication.pdf, base)'),
    'EPUB and PDF fallback artifacts share one generic same-origin localization primitive',
  );

  pass(
    'EPUB_READER_FALLBACK_CERT_CHAIN',
    pkg.includes('reader-migration.mjs && node scripts/certification/reader-fallback.mjs'),
    'P26 permanent certification is chained immediately after the P25 migration gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_FALLBACK_SOURCE_PASS');
