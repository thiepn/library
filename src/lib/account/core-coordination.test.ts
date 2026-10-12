import { describe, expect, it } from 'vitest';
import { readLibraryCoreGrant } from './core-coordination';
describe('B13 owner-local Library/Core device consent', () => {
  it('never treats missing, malformed, expired schema, or another owner as granted', () => {
    const owner = '11111111-1111-4111-8111-111111111111';
    const allowed = JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: true, revision: 4 });
    expect(readLibraryCoreGrant(allowed, owner)?.allowed).toBe(true);
    expect(readLibraryCoreGrant(allowed, 'other')).toBeNull();
    expect(readLibraryCoreGrant(null, owner)).toBeNull();
    expect(readLibraryCoreGrant('{', owner)).toBeNull();
    expect(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: true, revision: 0 }), owner)).toBeNull();
    expect(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 2, ownerId: owner, allowed: true, revision: 5 }), owner)).toBeNull();
    expect(readLibraryCoreGrant(JSON.stringify({ schemaVersion: 1, ownerId: owner, allowed: false, revision: 5 }), owner)?.allowed).toBe(false);
  });
});
