import assert from 'node:assert/strict';
import test from 'node:test';
import { describeNativeLibraryHeads } from '../../src/lib/account/conflict-preview';
const h = 'a'.repeat(64);
const base = { baselineRevision: 9, baselineHash: h, localHash: h, cloudRevision: 9, cloudHash: h };
test('B20 reports native CAS divergence without exposing actual reading contents', () => {
  assert.equal(describeNativeLibraryHeads(base).kind, 'matched');
  assert.equal(describeNativeLibraryHeads({ ...base, localHash: 'b'.repeat(64) }).kind, 'device-only');
  assert.equal(describeNativeLibraryHeads({ ...base, cloudRevision: 10 }).kind, 'cloud-only');
  assert.equal(describeNativeLibraryHeads({ ...base, cloudRevision: 10, localHash: 'b'.repeat(64) }).kind, 'both-changed');
});
test('B20 refuses missing cloud or non-comparable baseline', () => {
  assert.equal(describeNativeLibraryHeads({ ...base, cloudRevision: null, cloudHash: null }).kind, 'cloud-missing');
  assert.equal(describeNativeLibraryHeads({ ...base, baselineHash: null }).kind, 'baseline-missing');
  assert.equal(describeNativeLibraryHeads({ ...base, baselineRevision: -1 }).kind, 'baseline-missing');
});
