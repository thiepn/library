import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/migration.ts',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/read/[chapter].astro',
  'src/layouts/EpubReaderLayout.astro',
  'scripts/certification/reader-migration.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_MIGRATION_P25', present, 'P25 migration resolver, public route, preserved legacy route, publication-aware layout, and permanent certification are present');

if (present) {
  const [migration, launcher, legacyChapter, layout, pkg] = await Promise.all([
    readFile('src/lib/reader/migration.ts', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/[chapter].astro', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  const forbiddenTitles = ['ai-for-the-kingdom', 'how-to-love-god', 'the-unfinished-mission'];
  pass(
    'EPUB_READER_MIGRATION_GENERIC',
    migration.includes('resolveReaderPublicationCandidate(work)')
      && migration.includes("mode: 'native-epub'")
      && migration.includes("mode: 'legacy-web'")
      && migration.includes("mode: 'unavailable'")
      && forbiddenTitles.every((title) => !migration.includes(title)),
    'Migration is release-driven and contains no current-title allowlist',
  );

  const nativeIndex = migration.indexOf("mode: 'native-epub'");
  const legacyIndex = migration.indexOf("mode: 'legacy-web'");
  pass(
    'EPUB_READER_MIGRATION_NATIVE_FIRST',
    nativeIndex >= 0 && legacyIndex > nativeIndex && migration.indexOf('work.webMaterialized') > nativeIndex,
    'A resolved active EPUB release wins before the verified Markdown fallback',
  );

  pass(
    'EPUB_READER_MIGRATION_SAME_ORIGIN',
    migration.includes("const CANONICAL_MEDIA_ORIGIN = 'https://thiepn.dev/library/media/'")
      && migration.includes('localizeReaderPublication')
      && migration.includes('`${normalizedBase}/media/${relative}`'),
    'Canonical release artifacts are localized to the current Library base before EPUB.js opens them',
  );

  pass(
    'EPUB_READER_MIGRATION_PUBLIC_ROUTE',
    launcher.includes('resolveReaderMigration(work)')
      && launcher.includes('.filter(readerCanOpen)')
      && launcher.includes("migration.mode === 'native-epub'")
      && launcher.includes('EpubReaderLayout')
      && launcher.includes('ReaderShell'),
    'The canonical /works/[slug]/read route is the generic native-versus-legacy migration boundary',
  );

  pass(
    'EPUB_READER_MIGRATION_FULL_STACK',
    launcher.includes('mountReaderPublicationWithCompatibilityHarness')
      && !launcher.includes('new EpubJsEngine(')
      && !launcher.includes("from 'epubjs'"),
    'Migrated publications mount the complete P24 stack rather than bypassing reader controllers',
  );

  pass(
    'EPUB_READER_MIGRATION_RELEASE_IDENTITY',
    launcher.includes('data-reader-publication={JSON.stringify(publication)}')
      && launcher.includes('type ReaderPublicationCandidate')
      && launcher.includes('mountReaderPublicationWithCompatibilityHarness(root, publication)'),
    'The public route passes the resolved edition/release artifact identity unchanged into native progress, bookmarks, search, highlights, and notes',
  );

  pass(
    'EPUB_READER_MIGRATION_LEGACY_FALLBACK',
    launcher.includes("migration.mode === 'legacy-web'")
      && launcher.includes("import { getProgress } from '../../../../lib/client/library-db';")
      && launcher.includes('data-reader-launch')
      && launcher.includes('/read/${chapter}`'),
    'Works without an eligible active EPUB preserve the existing saved-position Markdown launcher',
  );

  pass(
    'EPUB_READER_MIGRATION_LEGACY_URLS',
    legacyChapter.includes('ReaderLayout')
      && legacyChapter.includes('getChaptersForWork(work.id)')
      && legacyChapter.includes('params: { slug: work.slug, chapter: chapter.entry.data.id }'),
    'Existing chapter URLs and ReaderLayout remain built for compatibility and rollback',
  );

  pass(
    'EPUB_READER_MIGRATION_NO_TITLE_LIST',
    forbiddenTitles.every((title) => !launcher.includes(title))
      && forbiddenTitles.every((title) => !legacyChapter.includes(title)),
    'Neither public reader routing path contains current-book-specific exceptions',
  );

  pass(
    'EPUB_READER_MIGRATION_LANGUAGE',
    layout.includes('language?: string')
      && layout.includes("language = 'en'")
      && layout.includes('<html lang={language}')
      && launcher.includes('language={work.language}'),
    'Migrated EPUB pages expose the publication language to the document and assistive technology',
  );

  pass(
    'EPUB_READER_MIGRATION_ERROR_SAFE',
    launcher.includes('data-reader-error-message')
      && launcher.includes("root.dataset.readerStatus = 'error'")
      && launcher.includes("window.addEventListener('pagehide'")
      && launcher.includes('mounted?.destroy()'),
    'Public native launch failures surface in the reader shell and runtime resources are torn down on navigation',
  );

  pass(
    'EPUB_READER_MIGRATION_CERT_CHAIN',
    pkg.includes('reader-compatibility.mjs && node scripts/certification/reader-migration.mjs'),
    'P25 migration certification is chained immediately after the P24 compatibility gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_MIGRATION_SOURCE_PASS');
