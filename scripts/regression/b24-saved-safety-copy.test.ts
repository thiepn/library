import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessSavedLibrarySafetyCopy, explainNativeLibraryConflictIssue,
} from '../../src/lib/account/saved-safety-copy';

const preview = {
  ownerId: '11111111-1111-4111-8111-111111111111',
  deviceId: 'device-one',
  localHash: 'a'.repeat(64),
  cloudHash: 'b'.repeat(64),
  cloudRevision: 9,
  expiresAt: 100_000,
};
const common = {
  preview, ownerId: preview.ownerId, deviceId: preview.deviceId,
  now: 30_000,
};
test('B24 safety validation binds actual file digest to its ORIGINAL direction', () => {
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, direction: 'use-device', selectedHash: preview.cloudHash,
  }), 'ready');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, direction: 'use-cloud', selectedHash: preview.localHash,
  }), 'ready');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, direction: 'use-device', selectedHash: preview.localHash,
  }), 'wrong-copy');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, direction: 'use-cloud', selectedHash: preview.cloudHash,
  }), 'wrong-copy');
});
test('B24 fails closed on expired, missing, cross-owner and wrong-device safety file', () => {
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, preview: null, direction: 'use-device', selectedHash: preview.cloudHash,
  }), 'not-prepared');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, ownerId: 'other', direction: 'use-device', selectedHash: preview.cloudHash,
  }), 'owner-changed');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, deviceId: 'other', direction: 'use-cloud', selectedHash: preview.localHash,
  }), 'owner-changed');
  assert.equal(assessSavedLibrarySafetyCopy({
    ...common, now: preview.expiresAt, direction: 'use-cloud', selectedHash: preview.localHash,
  }), 'expired');
});
test('B24 recovery guidance is direction-aware without emitting records', () => {
  assert.match(explainNativeLibraryConflictIssue('LIBRARY_SAFETY_WRONG_COPY'), /matching downloaded JSON/);
  assert.match(explainNativeLibraryConflictIssue('LIBRARY_SAFETY_HEAD_CHANGED_CLOUD'), /download new copies/);
  assert.match(explainNativeLibraryConflictIssue('LIBRARY_SAFETY_OWNER_OR_CLOUD_CHANGED'), /Account/);
});
