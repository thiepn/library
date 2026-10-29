import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { coalesceLibraryAccountAuthChanges } from '../../src/lib/account/auth-notifications.ts';
import { backupHasMeaningfulLibraryState, decideLibrarySync } from '../../src/lib/account/sync-policy.ts';

// These tests deliberately use the real source modules with no private Account
// dependency or network. They are NOT authenticated browser or cloud tests.
test('identical verification events cannot recursively schedule Account work', () => {
  const notifications = [];
  const notify = coalesceLibraryAccountAuthChanges(() => notifications.push('change'));
  const signedIn = { status: 'signed-in', id: 'owner-a', email: 'a@example.test' };
  notify({ status: 'signed-out' });
  notify({ status: 'signed-out' });
  assert.equal(notifications.length, 1);
  notify(signedIn);
  notify(signedIn);
  notify({ ...signedIn });
  assert.equal(notifications.length, 2);
  notify({ ...signedIn, email: 'new@example.test' });
  assert.equal(notifications.length, 3);
  notify({ status: 'signed-in', id: 'owner-b', email: 'new@example.test' });
  assert.equal(notifications.length, 4);
  notify({ status: 'unavailable', code: 'ACCOUNT_VERIFY_UNAVAILABLE' });
  notify({ status: 'unavailable', code: 'ACCOUNT_VERIFY_UNAVAILABLE' });
  assert.equal(notifications.length, 5);
  notify({ status: 'unavailable', code: 'ACCOUNT_REFRESH_UNAVAILABLE' });
  assert.equal(notifications.length, 6);
  notify({ status: 'signed-out' });
  notify({ status: 'signed-out' });
  assert.equal(notifications.length, 7);
});

test('public Library routes do not trigger automatic Account OAuth navigation', async () => {
  const [runtime, account, layout, auth] = await Promise.all([
    readFile('src/lib/account/runtime.ts', 'utf8'),
    readFile('src/lib/account/account-dom.ts', 'utf8'),
    readFile('src/layouts/BaseLayout.astro', 'utf8'),
    readFile('src/lib/account/supabase.ts', 'utf8'),
  ]);
  // Read-only authenticated-session lookup is permitted; starting a silent
  // OAuth probe/redirect from a public reading route is not.
  assert.match(layout, /mountLibraryAccountRuntime/);
  assert.match(runtime, /getVerifiedLibraryAccountUser\(\)/);
  assert.doesNotMatch(runtime, /initializeLibraryAccountSso\s*\(/);
  assert.doesNotMatch(runtime, /beginLibraryAccountSso\s*\(/);
  assert.match(runtime, /catch\s*\{/);
  assert.match(account, /initializeLibraryAccountSso\s*\(/);
  assert.match(account, /beginLibraryAccountSso\s*\(/);
  assert.match(auth, /subscribe\(coalesceLibraryAccountAuthChanges\(listener\)\)/);
});

test('conflicting local progress cannot be silently overwritten on first cloud connection', () => {
  const backup = {
    format: 'thiepn-library-backup',
    schemaVersion: 1,
    exportedAt: '2026-10-29T00:00:00.000Z',
    state: { main: { schemaVersion: 1,
      epubProgress: { schemaVersion: 1, records: [{ workId: 'important-book' }] },
    } },
  };
  assert.equal(backupHasMeaningfulLibraryState(backup), true);
  assert.equal(decideLibrarySync({
    localHash: 'local-progress',
    localMeaningful: backupHasMeaningfulLibraryState(backup),
    cloud: { revision: 9, hash: 'remote-progress' },
  }), 'conflict');
  assert.equal(decideLibrarySync({
    baseline: { revision: 7, hash: 'previously-synced' },
    localHash: 'local-progress',
    localMeaningful: true,
    cloud: { revision: 9, hash: 'remote-progress' },
  }), 'conflict');
});

test('cloud-only changes can be pulled; existing matching states are no-ops', () => {
  assert.equal(decideLibrarySync({
    baseline: { revision: 3, hash: 'unchanged-local' },
    cloud: { revision: 4, hash: 'updated-cloud' },
    localHash: 'unchanged-local',
    localMeaningful: true,
  }), 'pull');
  assert.equal(decideLibrarySync({
    cloud: { revision: 8, hash: 'same-state' },
    localHash: 'same-state',
    localMeaningful: true,
  }), 'noop');
  assert.equal(decideLibrarySync({
    localHash: 'new-device',
    localMeaningful: false,
    cloud: { revision: 2, hash: 'existing-cloud' },
  }), 'pull');
});
