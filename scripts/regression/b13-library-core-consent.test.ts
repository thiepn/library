import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readLibraryCoreGrant } from '../../src/lib/account/core-coordination';

test('B13 native Library Core consent stays denied without matching owner and revision', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const allowed = JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: true, revision: 4 });
  assert.equal(readLibraryCoreGrant(allowed, owner)?.allowed, true);
  assert.equal(readLibraryCoreGrant(allowed, 'other'), null);
  assert.equal(readLibraryCoreGrant(null, owner), null);
  assert.equal(readLibraryCoreGrant('{', owner), null);
  assert.equal(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: true, revision: 0 }), owner), null);
  assert.equal(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 2, ownerId: owner, allowed: true, revision: 4 }), owner), null);
  assert.equal(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: false, revision: 5 }), owner)?.allowed, false);
});
