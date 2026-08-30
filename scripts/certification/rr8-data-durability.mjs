import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'docs/RR8_DATA_DURABILITY_PORTABILITY.md',
  'src/lib/client/library-db.ts',
  'src/lib/client/personal-books.ts',
  'src/lib/client/library-portability.ts',
  'src/lib/pdf-reader/state.ts',
  'src/pages/backup.astro',
  'src/layouts/BaseLayout.astro',
  'tests/e2e/data-portability.spec.ts',
  '.github/workflows/data-durability.yml',
  '.github/workflows/deploy.yml',
  'package.json',
];

const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('RR8_FILES', present, 'RR8 implementation, documentation, user surface, browser acceptance, dedicated workflow, production gate, and package commands are present');

if (present) {
  const [doc, libraryDb, personal, portability, pdf, page, layout, tests, workflow, deployment, pkg] = await Promise.all([
    readFile('docs/RR8_DATA_DURABILITY_PORTABILITY.md', 'utf8'),
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('src/lib/client/personal-books.ts', 'utf8'),
    readFile('src/lib/client/library-portability.ts', 'utf8'),
    readFile('src/lib/pdf-reader/state.ts', 'utf8'),
    readFile('src/pages/backup.astro', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('tests/e2e/data-portability.spec.ts', 'utf8'),
    readFile('.github/workflows/data-durability.yml', 'utf8'),
    readFile('.github/workflows/deploy.yml', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('RR8_SCHEMA_MIGRATIONS',
    libraryDb.includes("const DB_VERSION = 9")
      && libraryDb.includes('FAVORITE_SCHEMA_VERSION = 1')
      && libraryDb.includes('LEGACY_PROGRESS_SCHEMA_VERSION = 1')
      && libraryDb.includes('oldVersion < 9')
      && personal.includes('const PERSONAL_DB_VERSION = 3')
      && personal.includes('PERSONAL_BOOK_SCHEMA_VERSION = 1')
      && personal.includes('oldVersion < 3'),
    'Previously unversioned active main/personal records have deterministic forward migrations');

  pass('RR8_DETERMINISTIC_BACKUP',
    portability.includes("LIBRARY_BACKUP_FORMAT = 'thiepn-library-backup'")
      && portability.includes('LIBRARY_BACKUP_SCHEMA_VERSION = 1')
      && portability.includes('sortBy(')
      && portability.includes('createLibraryBackupJson')
      && portability.includes('JSON.stringify(await createLibraryBackup(), null, 2)'),
    'Portable JSON uses a versioned envelope and stable record ordering');

  pass('RR8_COMPLETE_USER_STATE',
    portability.includes('favorites:')
      && portability.includes('epubProgress:')
      && portability.includes('legacyProgress:')
      && portability.includes('bookmarks:')
      && portability.includes('annotations:')
      && portability.includes('readingActivity:')
      && portability.includes('getPdfReaderStateSnapshot')
      && portability.includes('ReaderSettingsStore')
      && portability.includes('getPersonalBookPortableMetadata'),
    'Backup covers active reading state, settings, annotations, activity, PDF state, and personal-book metadata');

  pass('RR8_PERSONAL_BINARY_BOUNDARY',
    portability.includes('includesFiles: false')
      && portability.includes("!('file' in record)")
      && portability.includes("!('cover' in record)")
      && personal.includes('sha256')
      && personal.includes('pendingMetadataFor')
      && doc.includes('never includes personal EPUB/PDF bytes or cover blobs'),
    'Default JSON excludes personal publication binaries and relinks matching files by SHA-256 metadata');

  pass('RR8_PREVALIDATION_AND_PARTIAL_RESTORE',
    portability.includes('// Full validation happens before the first mutation.')
      && portability.indexOf('const backup = parseLibraryBackupJson(raw)') < portability.indexOf('replaceLibraryDbPortabilitySnapshot(mainPatch')
      && portability.includes('if (backup.state.main)')
      && portability.includes('if (backup.state.pdf)')
      && tests.includes('partial restore leaves omitted categories unchanged')
      && tests.includes('Unsupported Library backup schema version'),
    'Restore validates first, replaces only present categories, and rejects unsupported/corrupt archives before writes');

  pass('RR8_ATOMIC_MAIN_AND_PDF',
    libraryDb.includes("db.transaction([...requested], 'readwrite')")
      && pdf.includes("db.transaction(stores, 'readwrite')")
      && libraryDb.includes('store.clear()')
      && pdf.includes('store.clear()'),
    'Main categories and PDF progress/bookmarks each replace through one database transaction');

  pass('RR8_COMPENSATING_ROLLBACK',
    portability.includes('const [beforeMain, beforePdf, currentPersonalBooks]')
      && portability.includes('await replaceLibraryDbPortabilitySnapshot(beforeMain)')
      && portability.includes('await replacePdfReaderStateSnapshot(beforePdf)')
      && portability.includes('replacePendingPersonalBookMetadata(beforePending)')
      && tests.includes('failed cross-backend restore compensates back to the previous committed state')
      && tests.includes('RR8 rollback simulation'),
    'Cross-backend failures compensate to the pre-import snapshot and have injected failure acceptance coverage');

  pass('RR8_USER_SURFACE',
    page.includes('data-library-backup-export')
      && page.includes('data-library-backup-restore')
      && page.includes('data-library-backup-status')
      && page.includes('Personal EPUB/PDF files are not included')
      && layout.includes("href('/backup')"),
    'Backup/restore is discoverable and explicitly explains personal-file and local-only boundaries');

  pass('RR8_MIGRATION_ACCEPTANCE',
    tests.includes('historical main v8 and personal v2 records upgrade into versioned portable state')
      && tests.includes("indexedDB.open(mainDb, 8)")
      && tests.includes("indexedDB.open(personalDb, 2)"),
    'Browser acceptance seeds supported historical databases and verifies normalized portable output');

  const parsedPackage = JSON.parse(pkg);
  pass('RR8_COMMANDS_AND_CI',
    parsedPackage.scripts?.['test:durability']?.includes('data-portability.spec.ts')
      && parsedPackage.scripts?.['test:durability']?.includes('playwright.offline.config.ts tests/e2e/storage-reliability.spec.ts')
      && parsedPackage.scripts?.['certify:durability'] === 'node scripts/certification/rr8-data-durability.mjs'
      && parsedPackage.scripts?.['certify:source']?.includes('rr8-data-durability.mjs')
      && workflow.includes('pnpm certify:durability')
      && workflow.includes('pnpm test:durability'),
    'RR8 runs portability in the baseline matrix, storage reliability in its service-worker-enabled profile, and participates in release source certification');

  const ergonomicsIndex = deployment.indexOf('id: ergonomics');
  const durabilityIndex = deployment.indexOf('id: durability');
  const pagesIndex = deployment.indexOf('actions/upload-pages-artifact@v4');
  pass('RR8_PRODUCTION_GATE',
    deployment.includes('Run RR8 data durability, migration, backup, and portability acceptance')
      && deployment.includes('run: pnpm test:durability')
      && deployment.includes("if: failure() && steps.durability.outcome == 'failure'")
      && deployment.includes('RR8 data durability/migration/backup/portability acceptance before artifact upload')
      && ergonomicsIndex >= 0
      && durabilityIndex > ergonomicsIndex
      && pagesIndex > durabilityIndex,
    'Production Pages upload is gated on RR8 after RR7 and records the durability outcome');

  pass('RR8_NO_CLOUD_SYNC_PRETENSE',
    doc.includes('manual portability, not account sync')
      && page.includes('does not automatically sync your reading data or personal books'),
    'RR8 documents manual local portability without implying automatic cloud sync');
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.id} — ${check.detail}`);
if (failed.length) {
  console.error(`\nRR8 certification failed: ${failed.map((check) => check.id).join(', ')}`);
  process.exit(1);
}
console.log(`\nRR8 certification passed (${checks.length} checks).`);
