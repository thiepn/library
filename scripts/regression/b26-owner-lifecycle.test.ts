import assert from 'node:assert/strict';
import test from 'node:test';
import { isOriginalLibraryLifecycleCurrent } from '../../src/lib/account/lifecycle-authority';

const base = {
  startedEpoch: 4, currentEpoch: 4, startedOwner: 'owner1',
  authenticatedOwner: 'owner1', startedDevice: 'd1',
  currentDevice: 'd1', enabled: true,
};
test('B26 original Library owner and device lifecycle fences stale sync acknowledgements', () => {
  assert.equal(isOriginalLibraryLifecycleCurrent(base), true);
  assert.equal(isOriginalLibraryLifecycleCurrent({ ...base, currentEpoch: 5 }), false);
  assert.equal(isOriginalLibraryLifecycleCurrent({ ...base, authenticatedOwner: 'owner2' }), false);
  assert.equal(isOriginalLibraryLifecycleCurrent({ ...base, currentDevice: 'd2' }), false);
  assert.equal(isOriginalLibraryLifecycleCurrent({ ...base, enabled: false }), false);
  assert.equal(isOriginalLibraryLifecycleCurrent({ ...base, authenticatedOwner: null }), false);
});
