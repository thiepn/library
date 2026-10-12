import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectLibraryRecovery } from '../../src/lib/account/recovery-inspection';
const owner='11111111-1111-4111-8111-111111111111';
const basis={ownerId:owner,baselineOwner:owner,nativeEnabled:true,coreAllowed:false,
  lastSyncedAt:'2026-10-01T00:00:00Z',latest:'synced' as const,online:true};
test('B15 Library incident classification never certifies external custody',()=>{
  assert.equal(inspectLibraryRecovery(basis).status,'ready');
  assert.equal(inspectLibraryRecovery({...basis,online:false}).status,'offline');
  assert.equal(inspectLibraryRecovery({...basis,latest:'conflict'}).status,'conflict');
  assert.equal(inspectLibraryRecovery({...basis,latest:'error'}).status,'error');
  assert.equal(inspectLibraryRecovery({...basis,baselineOwner:'other'}).status,'owner-mismatch');
  assert.equal(inspectLibraryRecovery({...basis,ownerId:null}).status,'sign-in');
  assert.equal(inspectLibraryRecovery({...basis,nativeEnabled:false}).status,'local-only');
  assert.equal(inspectLibraryRecovery({...basis,lastSyncedAt:null}).status,'no-baseline');
  assert.equal(inspectLibraryRecovery(basis).isExternallyCertified,false);
});
