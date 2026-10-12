import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAutoSyncPreference } from '../../src/lib/account/auto-sync';
test('B10 device preference is scoped to original owner and never approves another owner', () => {
  const a = 'a-owner', b = 'b-owner';
  const disabled = JSON.stringify({ version: 1, ownerId: a, enabled: false });
  assert.equal(parseAutoSyncPreference(disabled,a), false);
  assert.equal(parseAutoSyncPreference(disabled,b), true);
  assert.equal(parseAutoSyncPreference(JSON.stringify({version: 1,ownerId:a,enabled: true}),a),true);
  assert.equal(parseAutoSyncPreference('invalid-json',a),true);
  assert.equal(parseAutoSyncPreference(JSON.stringify({version: 2,ownerId:a,enabled:false}),a),true);
});
