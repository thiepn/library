import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBRARY_BACKUP_KIND,
  LIBRARY_BACKUP_SCHEMA_VERSION,
  LibraryBackupError,
  createLibraryBackupArchive,
  parseLibraryBackupText,
  summarizeLibraryBackup,
} from '../../src/lib/data-portability/archive';
import { parseAppSettings } from '../../src/lib/client/app-settings';
import { portablePersonalBookMetadata } from '../../src/lib/data-portability/personal-metadata';

const favorite = (workId = 'work-a') => ({
  schemaVersion: 1 as const,
  workId,
  savedAt: '2026-08-30T10:00:00.000Z',
});

const progress = (workId = 'work-a') => ({
  schemaVersion: 2 as const,
  workId,
  edition: 1,
  releaseVersion: '1.0.0',
  cfi: 'epubcfi(/6/2!/4/2/1:0)',
  percentage: 0.25,
  furthestPercentage: 0.4,
  updatedAt: '2026-08-30T10:00:00.000Z',
});

test('RR8 accepts a valid partial backup without fabricating omitted sections', () => {
  const archive = createLibraryBackupArchive({ sections: { favorites: [favorite()] } });
  const parsed = parseLibraryBackupText(JSON.stringify(archive));
  assert.equal(parsed.kind, LIBRARY_BACKUP_KIND);
  assert.equal(parsed.schemaVersion, LIBRARY_BACKUP_SCHEMA_VERSION);
  assert.deepEqual(parsed.sections?.favorites, [favorite()]);
  assert.equal(parsed.sections?.epubProgress, undefined);
  assert.equal(summarizeLibraryBackup(parsed).records, 1);
});

test('RR8 rejects duplicate identities before restore can mutate storage', () => {
  const archive = createLibraryBackupArchive({ sections: { favorites: [favorite()] } });
  const corrupted = {
    ...archive,
    sections: { favorites: [favorite(), favorite()] },
  };
  assert.throws(
    () => parseLibraryBackupText(JSON.stringify(corrupted)),
    (error: unknown) => error instanceof LibraryBackupError && /duplicate identity/i.test(error.message),
  );
});

test('RR8 rejects corrupt native EPUB progress instead of coercing a fake location', () => {
  const archive = createLibraryBackupArchive({ sections: { epubProgress: [progress()] } });
  const corrupted = structuredClone(archive);
  corrupted.sections!.epubProgress![0]!.cfi = 'not-a-cfi';
  assert.throws(
    () => parseLibraryBackupText(JSON.stringify(corrupted)),
    (error: unknown) => error instanceof LibraryBackupError && /EPUB progress/i.test(error.message),
  );
});

test('RR8 rejects unknown future archive schemas explicitly', () => {
  const archive = createLibraryBackupArchive({ sections: { favorites: [favorite()] } });
  assert.throws(
    () => parseLibraryBackupText(JSON.stringify({ ...archive, schemaVersion: 99 })),
    (error: unknown) => error instanceof LibraryBackupError && /not supported/i.test(error.message),
  );
});

test('RR8 application settings migrate the historical unversioned appearance shape', () => {
  assert.deepEqual(parseAppSettings({ appearance: 'dark' }), { schemaVersion: 1, appearance: 'dark' });
  assert.equal(parseAppSettings({ appearance: 'neon' }), null);
});

test('RR8 personal-book metadata never serializes private publication bytes', () => {
  const metadata = portablePersonalBookMetadata({
    id: 'pdf-' + 'a'.repeat(32),
    format: 'pdf',
    title: 'Private PDF',
    fileName: 'private.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    sha256: 'a'.repeat(64),
    importedAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
  });
  const archive = createLibraryBackupArchive({ sections: { personalBooks: [metadata] } });
  const json = JSON.stringify(archive);
  assert.equal(Object.hasOwn(metadata, 'file'), false);
  assert.equal(Object.hasOwn(metadata, 'cover'), false);
  assert.equal(json.includes('ArrayBuffer'), false);
  assert.equal(json.includes('data:application/pdf'), false);
});
