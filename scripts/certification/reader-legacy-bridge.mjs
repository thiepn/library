import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/client/library-db.ts',
  'src/lib/reader/legacy-bridge.ts',
  'src/pages/works/[slug]/read/index.astro',
  'src/pages/works/[slug]/read/[chapter].astro',
  'src/layouts/ReaderLayout.astro',
  'src/styles/reader.css',
  'docs/READER_LEGACY_BRIDGE_P29.md',
  'scripts/certification/reader-legacy-bridge.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_LEGACY_BRIDGE_P29', present, 'P29 storage, route, UI, documentation, and permanent certification files are present');

if (present) {
  const [db, bridge, launcher, chapterRoute, layout, css, pkg] = await Promise.all([
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('src/lib/reader/legacy-bridge.ts', 'utf8'),
    readFile('src/pages/works/[slug]/read/index.astro', 'utf8'),
    readFile('src/pages/works/[slug]/read/[chapter].astro', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('src/styles/reader.css', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'EPUB_READER_LEGACY_PROGRESS_SIDECAR',
    db.includes('const DB_VERSION = 9')
      && db.includes("| 'legacyProgress'")
      && db.includes("['legacyProgress', 'workId']")
      && db.includes("transaction.objectStore('legacyProgress')")
      && db.includes('normalizeLegacyProgressRecord(cursor.value)')
      && db.includes('if (normalized) legacy.put(normalized)'),
    'The current DB schema retains the v7 P29 sidecar migration and RR8 normalizes recovered Markdown progress into an explicitly versioned legacy record',
  );

  pass(
    'EPUB_READER_LEGACY_PROGRESS_ISOLATION',
    db.includes('export async function getLegacyProgress')
      && db.includes('export async function setLegacyProgress')
      && db.includes("withStore('legacyProgress', 'readwrite'")
      && db.includes("withStore('progress', 'readwrite'")
      && db.includes('export async function setReaderProgress')
      && db.indexOf("withStore('legacyProgress', 'readwrite'") < db.indexOf('export async function getReaderProgress'),
    'Legacy Markdown writes and native EPUB writes use separate stores after P29',
  );

  pass(
    'EPUB_READER_LEGACY_API_COMPAT',
    db.includes('export async function getProgress(workId: string)')
      && db.includes('return getLegacyProgress(workId);')
      && db.includes('export async function setProgress(workId: string, progress: ProgressRecord)')
      && db.includes('return setLegacyProgress(workId, progress);'),
    'Historical getProgress/setProgress exports remain available as compatibility aliases',
  );

  pass(
    'EPUB_READER_LEGACY_EXPLICIT_ENTRY',
    launcher.includes('?legacy=1')
      && launcher.includes('data-reader-legacy-bridge')
      && launcher.includes('isLegacyReaderRequested')
      && launcher.includes('resolveLegacyResumeHref')
      && launcher.includes('fallbackWebHref={legacyFallbackHref'),
    'The canonical reader exposes an explicit legacy=1 compatibility entry and P26 fallback resumes through it',
  );

  pass(
    'EPUB_READER_LEGACY_SAFE_RESUME',
    bridge.includes('getLegacyProgress')
      && bridge.includes('new Set(request.chapterIds)')
      && bridge.includes('allowed.has(progress.chapterId)')
      && bridge.includes('buildLegacyChapterHref')
      && !bridge.includes('getReaderProgress')
      && !bridge.includes('setReaderProgress')
      && !bridge.includes('.cfi'),
    'Compatibility resume is bounded to verified legacy chapter IDs and never fabricates EPUB state',
  );

  pass(
    'EPUB_READER_LEGACY_NO_AUTO_POSITION_MAP',
    bridge.includes('does not translate')
      && bridge.includes('EPUB CFIs')
      && !bridge.includes('percentageFromCfi')
      && !bridge.includes('cfiFromPercentage'),
    'P29 explicitly forbids automatic old-position to EPUB-CFI translation across potentially rewritten releases',
  );

  pass(
    'EPUB_READER_LEGACY_URL_PRESERVATION',
    chapterRoute.includes('params: { slug: work.slug, chapter: chapter.entry.data.id }')
      && chapterRoute.includes('ReaderLayout')
      && chapterRoute.includes('resolveReaderMigration(work)')
      && !chapterRoute.includes('Astro.redirect')
      && !chapterRoute.includes('location.replace'),
    'Existing /read/[chapter] URLs remain real readable pages and are never silently redirected',
  );

  pass(
    'EPUB_READER_LEGACY_FORWARD_BRIDGE',
    chapterRoute.includes("migration.mode === 'native-epub'")
      && chapterRoute.includes('nativeReaderHref={nativeReaderHref}')
      && layout.includes('Legacy web reader')
      && layout.includes('Open current reader')
      && layout.includes('nativeReaderHref')
      && css.includes('.reader-compatibility'),
    'Legacy chapter pages clearly bridge forward to the canonical native reader when an active EPUB exists',
  );

  pass(
    'EPUB_READER_LEGACY_CANONICALIZATION',
    layout.includes("<meta name=\"robots\" content=\"noindex,follow\"")
      && layout.includes('new URL(nativeReaderHref')
      && layout.includes('<link rel="canonical" href={canonical}'),
    'Compatibility pages remain accessible while canonical metadata points migrated titles at the native reader',
  );

  pass(
    'EPUB_READER_LEGACY_PWA_CONTINUITY',
    layout.includes('manifest.webmanifest')
      && layout.includes('registerLibraryPwa')
      && layout.includes('void registerLibraryPwa();'),
    'Direct old-reader bookmarks still register the P28 Library PWA/offline shell',
  );

  pass(
    'EPUB_READER_LEGACY_PRIMARY_UNCHANGED',
    launcher.includes("migration.mode === 'legacy-web'")
      && launcher.includes('resolveLegacyResumeHref')
      && launcher.includes('data-reader-launch'),
    'Works that still rely on Markdown remain first-class and resume their own legacy position',
  );

  const forbiddenTitles = ['ai-for-the-kingdom', 'how-to-love-god', 'the-unfinished-mission'];
  pass(
    'EPUB_READER_LEGACY_GENERIC',
    forbiddenTitles.every((title) => !bridge.includes(title))
      && forbiddenTitles.every((title) => !launcher.includes(title))
      && forbiddenTitles.every((title) => !chapterRoute.includes(title))
      && forbiddenTitles.every((title) => !layout.includes(title)),
    'P29 contains no current-book allowlist, chapter mapping, or title-specific compatibility exception',
  );

  pass(
    'EPUB_READER_LEGACY_CERT_CHAIN',
    pkg.includes('reader-offline.mjs && node scripts/certification/reader-legacy-bridge.mjs'),
    'P29 certification is chained immediately after the P28 offline/PWA gate',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_LEGACY_BRIDGE_SOURCE_PASS');
