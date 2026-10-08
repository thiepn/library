import assert from 'node:assert/strict';
import test from 'node:test';
import type { LibraryBackupV1 } from '../../src/lib/client/library-portability';
import { backupHasMeaningfulLibraryState, decideLibrarySync } from '../../src/lib/account/sync-policy';

function backup(records = 0): LibraryBackupV1 {
  return {
    format: 'thiepn-library-backup',
    schemaVersion: 1,
    exportedAt: '2026-10-05T00:00:00.000Z',
    state: {
      main: {
        schemaVersion: 1,
        favorites: {
          schemaVersion: 1,
          records: Array.from({ length: records }, (_, index) => ({
            schemaVersion: 1,
            workId: `work-${index}`,
            savedAt: '2026-10-05T00:00:00.000Z',
          })),
        },
      },
    },
  };
}

test('empty portable state is not meaningful', () => {
  assert.equal(backupHasMeaningfulLibraryState(backup()), false);
});

test('saved reading state is meaningful', () => {
  assert.equal(backupHasMeaningfulLibraryState(backup(1)), true);
});

function pdfAnnotationOnly(note: string): LibraryBackupV1 {
  const result = backup();
  result.state.pdf = {
    schemaVersion: 1,
    progress: { schemaVersion: 1, records: [] },
    bookmarks: { schemaVersion: 1, records: [] },
    annotations: {
      schemaVersion: 1,
      records: [{
        schemaVersion: 1,
        id: 'pdf-annotation-only',
        publicationKey: 'sample::1::release-a',
        identity: { workId: 'sample', edition: 1, releaseVersion: 'release-a' },
        page: 4,
        quote: 'Keep this annotated passage.',
        note,
        rects: [{ x: 0.2, y: 0.3, width: 0.4, height: 0.1 }],
        createdAt: '2026-10-08T08:00:00.000Z',
        updatedAt: '2026-10-08T08:05:00.000Z',
      }],
    },
  };
  return result;
}

test('PDF-only highlights and notes are meaningful even without progress or bookmarks', () => {
  for (const note of ['', 'My research note']) {
    assert.equal(backupHasMeaningfulLibraryState(pdfAnnotationOnly(note)), true);
  }

  const emptyPdf = backup();
  emptyPdf.state.pdf = {
    schemaVersion: 1,
    annotations: { schemaVersion: 1, records: [] },
  };
  assert.equal(backupHasMeaningfulLibraryState(emptyPdf), false);
});

test('first cloud sync cannot silently replace PDF-only annotations', () => {
  const local = pdfAnnotationOnly('Only local copy');
  assert.equal(decideLibrarySync({
    localHash: 'pdf-annotations-only',
    localMeaningful: backupHasMeaningfulLibraryState(local),
    cloud: { revision: 7, hash: 'another-device' },
  }), 'conflict');
});

test('first empty device pulls existing cloud state', () => {
  assert.equal(decideLibrarySync({
    localHash: 'local',
    localMeaningful: false,
    cloud: { revision: 2, hash: 'cloud' },
  }), 'pull');
});

test('first populated device conflicts with existing different cloud state', () => {
  assert.equal(decideLibrarySync({
    localHash: 'local',
    localMeaningful: true,
    cloud: { revision: 2, hash: 'cloud' },
  }), 'conflict');
});

test('one-sided changes reconcile automatically', () => {
  assert.equal(decideLibrarySync({
    baseline: { revision: 2, hash: 'base' },
    localHash: 'local',
    localMeaningful: true,
    cloud: { revision: 2, hash: 'base' },
  }), 'push');

  assert.equal(decideLibrarySync({
    baseline: { revision: 2, hash: 'base' },
    localHash: 'base',
    localMeaningful: true,
    cloud: { revision: 3, hash: 'cloud' },
  }), 'pull');
});

test('two-sided changes never silently overwrite', () => {
  assert.equal(decideLibrarySync({
    baseline: { revision: 2, hash: 'base' },
    localHash: 'local',
    localMeaningful: true,
    cloud: { revision: 3, hash: 'cloud' },
  }), 'conflict');
});
