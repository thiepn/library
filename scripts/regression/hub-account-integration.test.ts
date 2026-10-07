import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bridge = await readFile('src/lib/hub/bridge.ts', 'utf8');
const account = await readFile('src/lib/hub/account.ts', 'utf8');
const sync = await readFile('src/lib/account/sync.ts', 'utf8');
const consentPage = await readFile('src/pages/hub/index.astro', 'utf8');

test('P4 fixes the PDF reader v2 bridge boundary', () => {
  assert.match(bridge, /readRows\('thiepn-library-pdf-reader', 2, 'progress'\)/);
  assert.doesNotMatch(bridge, /readRows\('thiepn-library-pdf-reader', 1, 'progress'\)/);
});

test('Account-aware Hub reading compares through Library without write-capable reconciliation', () => {
  assert.match(account, /getVerifiedLibraryAccountUser/);
  assert.match(account, /isLibrarySyncEnabledForUser/);
  assert.match(account, /compareLibraryAccountStateReadOnly/);
  assert.match(sync, /compareLibraryAccountStateReadOnly/);
  assert.match(sync, /readCloudState\(\)/);
  assert.match(sync, /createLibraryBackup\(\)/);
  assert.match(sync, /hashReadingProgress(cloud.state)/);
  assert.match(sync, /hashReadingProgress(local)/);
  assert.doesNotMatch(account, /reconcileLibraryAccountSync|sync_thiepn_library_state|\.insert\(|\.update\(|\.delete\(/);
  assert.doesNotMatch(bridge, /supabase|sync_thiepn_library_state/);
});

test('Account sharing requires explicit v2 consent and exact account matching', () => {
  assert.match(consentPage, /name="account"/);
  assert.match(consentPage, /schemaVersion: 2/);
  assert.match(consentPage, /includeAccount/);
  assert.match(account, /user\.id\.toLowerCase\(\) !== hubAccountId\.toLowerCase\(\)/);
});

test('legacy Hub connections are down-converted and stay device-local', () => {
  assert.match(bridge, /legacyConnect/);
  assert.match(bridge, /legacyConsent\(consent\)/);
  assert.match(bridge, /coverage: 'device-local' \| 'account-synced'/);
});
