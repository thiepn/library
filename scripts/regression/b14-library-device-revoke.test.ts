import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLibraryCoreGrant } from '../../src/lib/account/core-consent';
test('B14 native Library device revocation is a distinct newer local revision', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const allowed = { schemaVersion: 1, ownerId: owner, allowed: true, revision: 8 };
  const revoked = { ...allowed, allowed: false, revision: 9 };
  assert.equal(readLibraryCoreGrant(JSON.stringify(allowed), owner)?.revision, 8);
  assert.equal(readLibraryCoreGrant(JSON.stringify(revoked), owner)?.allowed, false);
  assert.equal(readLibraryCoreGrant(JSON.stringify(revoked), 'other-owner'), null);
  assert.equal(readLibraryCoreGrant(JSON.stringify({ ...allowed, revision: Number.MAX_SAFE_INTEGER + 1 }), owner), null);
});
