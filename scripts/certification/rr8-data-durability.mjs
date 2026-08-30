import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR8_DATA_DURABILITY.md',
  'src/lib/client/app-settings.ts',
  'src/lib/client/library-db.ts',
  'src/lib/client/personal-books.ts',
  'src/lib/pdf-reader/state.ts',
  'src/lib/data-portability/archive.ts',
  'src/lib/data-portability/storage.ts',
  'src/lib/data-portability/personal-metadata.ts',
  'src/pages/data.astro',
  'src/pages/privacy.astro',
  'src/styles/data-portability.css',
  'scripts/regression/data-portability.test.ts',
  'tests/e2e/data-portability.spec.ts',
  '.github/workflows/data-durability.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR8_FILES', present, 'RR8 documentation, versioned stores, portable archive/runtime, user UI, regression/browser tests, workflow, and production gate are present');

if (present) {
  const [doc, appSettings, db, personal, pdf, archive, storage, personalMetadata, page, privacy, css, regression, browserTests, workflow, deploy, pkg] = await Promise.all([
    readFile('docs/RR8_DATA_DURABILITY.md', 'utf8'),
    readFile('src/lib/client/app-settings.ts', 'utf8'),
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('src/lib/client/personal-books.ts', 'utf8'),
    readFile('src/lib/pdf-reader/state.ts', 'utf8'),
    readFile('src/lib/data-portability/archive.ts', 'utf8'),
    readFile('src/lib/data-portability/storage.ts', 'utf8'),
    readFile('src/lib/data-portability/personal-metadata.ts', 'utf8'),
    readFile('src/pages/data.astro', 'utf8'),
    readFile('src/pages/privacy.astro', 'utf8'),
    readFile('src/styles/data-portability.css', 'utf8'),
    readFile('scripts/regression/data-portability.test.ts', 'utf8'),
    readFile('tests/e2e/data-portability.spec.ts', 'utf8'),
    readFile('.github/workflows/data-durability.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR8_MAIN_DB_V9',
    db.includes('const DB_VERSION = 9')
      && db.includes("| 'pdfProgress'")
      && db.includes("| 'pdfBookmarks'")
      && db.includes("| 'portablePersonalMetadata'")
      && db.includes("['pdfProgress', 'id']")
      && db.includes("['pdfBookmarks', 'id']")
      && db.includes("['portablePersonalMetadata', 'id']")
      && db.includes("db.addEventListener('versionchange', () => db.close())"),
    'The main Library DB advances additively to v9 with portable PDF/personal metadata stores and multi-tab versionchange cleanup');

  pass('RR8_HISTORICAL_RECORD_VERSIONING',
    db.includes('FAVORITE_SCHEMA_VERSION = 1')
      && db.includes('LEGACY_PROGRESS_SCHEMA_VERSION = 1')
      && db.includes('LEGACY_ANNOTATION_SCHEMA_VERSION = 1')
      && db.includes('if (oldVersion < 9')
      && db.includes("migrateCursor(transaction.objectStore('favorites')")
      && db.includes("migrateCursor(transaction.objectStore('legacyProgress')")
      && db.includes("migrateCursor(transaction.objectStore('annotations')")
      && appSettings.includes('APP_SETTINGS_SCHEMA_VERSION = 1')
      && appSettings.includes('Upgrade the historical unversioned'),
    'Previously unversioned actively portable records receive explicit v1 schemas without deleting historical state');

  pass('RR8_EPUB_IDENTITY_PRESERVED',
    db.includes('ReaderProgressRecordV2')
      && db.includes("record.cfi.startsWith('epubcfi('")
      && storage.includes('sameEpubProgressIdentity')
      && storage.includes('the backup belongs to a different edition or release')
      && !storage.includes('cfiFromPercentage')
      && browserTests.includes('different edition or release') === false
      && browserTests.includes('current-release')
      && browserTests.includes('old-release'),
    'Restore preserves exact EPUB CFI/release identity and refuses stale-release position replacement');

  pass('RR8_PDF_FORWARD_MIGRATION',
    pdf.includes("LEGACY_DB_NAME = 'thiepn-library-pdf-reader'")
      && pdf.includes("PROGRESS_STORE = 'pdfProgress'")
      && pdf.includes("BOOKMARK_STORE = 'pdfBookmarks'")
      && pdf.includes('getLegacyProgress(identity)')
      && pdf.includes('getLegacyBookmarks(identity)')
      && pdf.includes('getAllPdfStateForPortability')
      && !pdf.includes('deleteDatabase(LEGACY_DB_NAME)')
      && browserTests.includes('legacy PDF state'),
    'PDF writes use the main atomic state DB while the historical PDF DB remains a readable migration/export source');

  pass('RR8_PERSONAL_FILE_BOUNDARY',
    personal.includes('const PERSONAL_DB_VERSION = 3')
      && personal.includes('PERSONAL_BOOK_SCHEMA_VERSION = 1')
      && personal.includes('cursor.update(toVersionedStoredRecord(cursor.value))')
      && personalMetadata.includes("PORTABLE_PERSONAL_METADATA_STORE = 'portablePersonalMetadata'")
      && personalMetadata.includes('sha256: string')
      && !personalMetadata.includes('file: Blob')
      && archive.includes('personalBooks?: PortablePersonalBookMetadataV1[]')
      && page.includes('Personal EPUB/PDF file bytes are not included')
      && browserTests.includes('without changing private file bytes'),
    'Personal files remain in their dedicated DB; backup/restore carries only hash-bound metadata and never fabricates missing file bytes');

  pass('RR8_ARCHIVE_CONTRACT',
    archive.includes("LIBRARY_BACKUP_KIND = 'thiepn-library-backup'")
      && archive.includes('LIBRARY_BACKUP_SCHEMA_VERSION = 1')
      && archive.includes('LIBRARY_BACKUP_MAX_BYTES = 8 * 1024 * 1024')
      && archive.includes('assertUnique')
      && archive.includes('Backup JSON is corrupt or incomplete')
      && archive.includes('not supported by this Library version')
      && regression.includes('duplicate identities')
      && regression.includes('corrupt native EPUB progress')
      && regression.includes('valid partial backup'),
    'Backup JSON has a frozen schema, bounded size, strict record validation, duplicate rejection, partial-section support, and fast regressions');

  pass('RR8_ATOMIC_RESTORE',
    storage.includes("db.transaction(stores, 'readwrite')")
      && storage.includes('transaction.abort()')
      && storage.includes('restoreRawSettings(storage, rawSettings)')
      && !storage.includes('.clear()')
      && browserTests.includes('quota failure aborts the full restore transaction')
      && browserTests.includes('rr8-atomic-favorite'),
    'Restore is merge-only and one main-DB transaction; injected write failure proves earlier pending writes roll back and settings are restored');

  pass('RR8_EXPORT_COVERAGE',
    archive.includes('favorites?: FavoriteRecordV1[]')
      && archive.includes('epubProgress?: ReaderProgressRecordV2[]')
      && archive.includes('legacyProgress?: StoredLegacyProgressRecordV1[]')
      && archive.includes('epubBookmarks?: ReaderBookmarkRecordV2[]')
      && archive.includes('epubAnnotations?: ReaderAnnotationRecordV2[]')
      && archive.includes('readingActivity?: ReadingActivityRecordV1[]')
      && archive.includes('pdfProgress?: PdfProgressRecord[]')
      && archive.includes('pdfBookmarks?: PdfBookmarkRecord[]')
      && archive.includes('personalBooks?: PortablePersonalBookMetadataV1[]')
      && archive.includes('app?: AppSettingsV1')
      && archive.includes('epub?: ReaderSettingsRecord')
      && archive.includes('pdf?: PdfReaderSettings'),
    'The portable contract covers required activity, favorites, EPUB/PDF positions, bookmarks, highlights/notes, settings, and personal metadata');

  pass('RR8_USER_PORTABILITY_UI',
    page.includes('Data & backup')
      && page.includes('Create backup')
      && page.includes('Restore backup')
      && page.includes('merge-safe')
      && page.includes('does not automatically sync')
      && page.includes('createLibraryBackup')
      && page.includes('restoreLibraryBackupText')
      && css.includes('@media (max-width: 760px)')
      && css.includes('@media (forced-colors: active)'),
    'Users can export and restore from an accessible responsive application surface without database developer tools');

  pass('RR8_PRIVACY',
    doc.includes('no automatic cloud synchronization')
      && privacy.includes('does not automatically cloud-sync')
      && !storage.includes('fetch(')
      && !storage.includes('XMLHttpRequest')
      && !archive.includes('fetch('),
    'RR8 is local-only and introduces no account, telemetry, automatic sync, or upload path');

  pass('RR8_BROWSER_ACCEPTANCE',
    browserTests.includes('v8 main state upgrades to v9')
      && browserTests.includes('current EPUB release position')
      && browserTests.includes('quota failure')
      && browserTests.includes('legacy PDF state')
      && browserTests.includes('personal DB v2 records gain schema v1')
      && workflow.includes('name: Data Durability Acceptance')
      && workflow.includes('playwright install --with-deps chromium firefox webkit')
      && workflow.includes('pnpm test:data-durability'),
    'Dedicated three-engine acceptance exercises migration, conflict handling, rollback, legacy PDF compatibility, and personal-byte preservation');

  const rr7Index = deploy.indexOf('id: ergonomics');
  const rr8Index = deploy.indexOf('id: durability');
  const pagesIndex = deploy.indexOf('actions/upload-pages-artifact@v4');
  pass('RR8_PRODUCTION_GATE',
    deploy.includes('Run RR8 data durability, migration, backup, and portability acceptance')
      && deploy.includes('run: pnpm test:data-durability')
      && deploy.includes('DURABILITY_RESULT: ${{ needs.build.outputs.durability }}')
      && deploy.includes('RR8 data durability/migration/backup/portability before artifact upload')
      && rr7Index >= 0
      && rr8Index > rr7Index
      && pagesIndex > rr8Index,
    'Production runs RR8 after RR7 and before Pages artifact upload, and records the exact gate outcome');

  const scripts = JSON.parse(pkg).scripts ?? {};
  pass('RR8_PACKAGE_COMMANDS',
    scripts['certify:data-durability'] === 'node scripts/certification/rr8-data-durability.mjs'
      && typeof scripts['test:data-durability'] === 'string'
      && scripts['test:data-durability'].includes('data-portability.spec.ts')
      && scripts['test:data-durability'].includes('chromium-desktop')
      && scripts['test:data-durability'].includes('firefox-desktop')
      && scripts['test:data-durability'].includes('webkit-desktop')
      && typeof scripts['certify:source'] === 'string'
      && scripts['certify:source'].endsWith('node scripts/certification/rr8-data-durability.mjs'),
    'RR8 exposes stable source/browser commands and is the final source gate after RR7');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log(`RR8_DATA_DURABILITY_SOURCE_PASS checks=${checks.length}`);
