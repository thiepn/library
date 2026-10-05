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
