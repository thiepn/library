import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Library routes destructive cloud-data deletion through THIEPN Account', async () => {
  const [syncSource, accountDom, accountPage, migration] = await Promise.all([
    readFile('src/lib/account/sync.ts', 'utf8'),
    readFile('src/lib/account/account-dom.ts', 'utf8'),
    readFile('src/pages/account.astro', 'utf8'),
    readFile('supabase/migrations/20261005134753_library_account_deletion_authority.sql', 'utf8'),
  ]);

  assert.equal(syncSource.includes("rpc('delete_thiepn_library_state')"), false);
  assert.equal(accountDom.includes('deleteLibraryCloudCopy'), false);
  assert.equal(accountPage.includes('data-delete-cloud'), false);
  assert.equal(accountPage.includes('https://account.thiepn.dev/privacy/apps/library'), true);
  assert.equal(migration.includes('revoke execute on function public.delete_thiepn_library_state() from authenticated'), true);
});
