import assert from 'node:assert/strict';
import test from 'node:test';
import { assessNativeReconciliation } from '../../src/lib/account/native-reconciliation';
const ownerId = '11111111-1111-4111-8111-111111111111';
const good = {
  ownerId, deviceId: 'device-1',
  authenticatedOwnerId: ownerId,
  activeOwnerId: ownerId, activeDeviceId: 'device-1', enabled: true,
  expectedRevision: 4, expectedHash: 'a'.repeat(64),
  observedRevision: 4, observedCloudHash: 'a'.repeat(64),
  observedLocalHash: 'a'.repeat(64),
};
test('B19 confirms only after original native owner, local and cloud rereads match', () => {
  assert.equal(assessNativeReconciliation(good), 'confirmed-native-only');
  assert.equal(assessNativeReconciliation({ ...good, activeDeviceId: 'device-2' }), 'owner-or-device-changed');
  assert.equal(assessNativeReconciliation({ ...good, authenticatedOwnerId: null }), 'owner-or-device-changed');
  assert.equal(assessNativeReconciliation({ ...good, enabled: false }), 'owner-or-device-changed');
});
test('B19 rejects a second-device CAS after our write, changed local edits and deleted cloud', () => {
  assert.equal(assessNativeReconciliation({ ...good, observedRevision: 5 }), 'cloud-changed');
  assert.equal(assessNativeReconciliation({ ...good, observedCloudHash: 'b'.repeat(64) }), 'cloud-changed');
  assert.equal(assessNativeReconciliation({ ...good, observedLocalHash: 'c'.repeat(64) }), 'local-changed');
  assert.equal(assessNativeReconciliation({ ...good, observedRevision: null, observedCloudHash: null }), 'missing-cloud');
});
