import test from 'node:test';
import assert from 'node:assert/strict';
import { assessLibraryPostChoice } from '../../src/lib/account/post-choice-review';
const valid = {
  originalResult: 'pushed' as const,
  expectedRevision: 5, observedRevision: 5,
  observedKind: 'matched' as const,
  nativeAuthorityStillValid: true,
};
test('B22 resolves Library conflict only after native post-choice readback', () => {
  const result = assessLibraryPostChoice(valid);
  assert.equal(result.status, 'observed-match');
  assert.equal(result.externalCustody, 'NOT_TESTED');
  assert.match(result.instruction, /not an atomic/);
});
test('B22 holds conflict after second-device CAS, changed owner or diverged snapshots', () => {
  assert.equal(assessLibraryPostChoice({ ...valid, observedRevision: 6 }).status, 'retain-conflict');
  assert.equal(assessLibraryPostChoice({ ...valid, observedKind: 'both-changed' }).status, 'retain-conflict');
  assert.equal(assessLibraryPostChoice({ ...valid, nativeAuthorityStillValid: false }).status, 'retain-conflict');
  assert.equal(assessLibraryPostChoice({ ...valid, originalResult: 'conflict' }).status, 'retain-conflict');
  assert.equal(assessLibraryPostChoice({ ...valid, observedKind: 'baseline-missing' }).status, 'unconfirmed');
});
