import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNativeCloudRestore } from '../../src/lib/account/recovery-guard';

const preview = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  deviceId: 'device-1',
  localHash: 'a'.repeat(64),
  cloudHash: 'b'.repeat(64),
  cloudRevision: 2,
  expiresAt: 200_000,
};
const current = {
  ...preview, now: 100_000,
  nativeEnabled: true,
};
test('B17 original native Library cloud restore needs fresh owner-bound safety copy', () => {
  assert.equal(validateNativeCloudRestore(preview, current), 'ready');
  assert.equal(validateNativeCloudRestore(null, current), 'not-prepared');
  assert.equal(validateNativeCloudRestore(preview, { ...current, now: 200_000 }), 'expired');
  assert.equal(validateNativeCloudRestore(preview, { ...current, nativeEnabled: false }), 'owner-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...current, deviceId: 'device-2' }), 'owner-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...current, ownerId: '22222222-2222-4222-8222-222222222222' }), 'owner-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...current, localHash: 'c'.repeat(64) }), 'local-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...current, cloudRevision: 3 }), 'cloud-changed');
  assert.equal(validateNativeCloudRestore(preview, { ...current, cloudHash: 'd'.repeat(64) }), 'cloud-changed');
});
