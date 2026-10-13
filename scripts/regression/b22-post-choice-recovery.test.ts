import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPostChoiceRecovery } from '../../src/lib/account/post-choice-recovery';

test('B22 only signals resolved native conflict after a new matching readback', () => {
  assert.equal(classifyPostChoiceRecovery({ initialResult: 'pushed', heads: 'matched' }).status,
    'observed-matched');
  assert.equal(classifyPostChoiceRecovery({ initialResult: 'pulled', heads: 'cloud-only' }).status,
    'changed-after-choice');
  assert.equal(classifyPostChoiceRecovery({ initialResult: 'synced', heads: null }).status,
    'changed-after-choice');
  assert.equal(classifyPostChoiceRecovery({ initialResult: 'conflict', heads: 'matched' }).status,
    'unresolved');
  assert.equal(classifyPostChoiceRecovery({ initialResult: 'error', heads: 'matched' }).status,
    'unresolved');
});
