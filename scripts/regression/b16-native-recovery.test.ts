import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createLibraryRecoveryIncidentHistory,
  describeNativeLibraryRecovery,
} from '../../src/lib/account/recovery-incidents';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
test('B16 original Library CAS explanation requires native conflict decision', () => {
  const conflict = describeNativeLibraryRecovery({
    status: 'conflict', message: 'Another device changed the cloud', revision: 9,
  }, 7);
  assert.equal(conflict.requiresNativeChoice, true);
  assert.match(conflict.original, /7/);
  assert.match(conflict.remote, /9/);
  assert.match(conflict.action, /original CAS conflict chooser/);
  assert.equal(conflict.externalCustody, 'NOT_TESTED');
  assert.equal(describeNativeLibraryRecovery({
    status: 'synced', message: 'Native confirmed', revision: 9,
  }, 9).requiresNativeChoice, false);
});
test('B16 native incident observations are bounded, owner-only and volatile', () => {
  const history = createLibraryRecoveryIncidentHistory(() => 123);
  for (let index = 0; index < 20; index++)
    history.record(owner, 'native-sync', 'conflict', index, index + 1);
  assert.equal(history.forOwner(owner).length, 16);
  assert.equal(history.forOwner(owner)[0]?.baselineRevision, 4);
  assert.deepEqual(history.forOwner(other), []);
  history.record(other, 'native-backup', 'opened', null, null);
  assert.deepEqual(history.forOwner(owner), []);
  history.clear();
  assert.deepEqual(history.forOwner(other), []);
});
