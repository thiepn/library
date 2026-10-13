import assert from 'node:assert/strict';
import test from 'node:test';
import { assessLibraryRestoreReadback } from '../../src/lib/account/restore-witness';

const ownerId = '11111111-1111-4111-8111-111111111111';
const good = {
  ownerId, deviceId: 'device-1', revision: 7,
  expectedHash: 'a'.repeat(64), observedHash: 'a'.repeat(64),
  authenticatedOwnerId: ownerId, activeDevice: true,
};
test('B18 original Library readback confirms only local imported data', () => {
  const result = assessLibraryRestoreReadback(good);
  assert.equal(result.status, 'native-readback-only');
  assert.match(result.next, /does not certify independent/);
});
test('B18 never advances confirmed baseline after changed owner/device or snapshot', () => {
  assert.equal(assessLibraryRestoreReadback({ ...good, observedHash: 'b'.repeat(64) }).status, 'readback-diverged');
  assert.equal(assessLibraryRestoreReadback({ ...good, authenticatedOwnerId: null }).status, 'authority-changed');
  assert.equal(assessLibraryRestoreReadback({ ...good, activeDevice: false }).status, 'authority-changed');
  assert.equal(assessLibraryRestoreReadback({ ...good, revision: -1 }).status, 'invalid-head');
});
