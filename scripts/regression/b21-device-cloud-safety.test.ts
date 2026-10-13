import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNativeCloudRestore } from '../../src/lib/account/recovery-guard';

const preview = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  deviceId: 'original-device',
  localHash: 'a'.repeat(64),
  cloudHash: 'b'.repeat(64),
  cloudRevision: 12,
  expiresAt: 62000,
};
const now = { ...preview, now: 30000, nativeEnabled: true };
test('B21 original cloud safety copy gates replacing remote snapshot with local Device', () => {
  assert.equal(validateNativeCloudRestore(null, now), 'not-prepared');
  assert.equal(validateNativeCloudRestore(preview, now), 'ready');
  assert.equal(validateNativeCloudRestore(preview, { ...now, cloudRevision: 13 }), 'cloud-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...now, cloudHash: 'c'.repeat(64) }), 'cloud-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...now, localHash: 'd'.repeat(64) }), 'local-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...now, deviceId: 'other' }), 'owner-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...now, nativeEnabled: false }), 'owner-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...now, now: 62000 }), 'expired');
});
