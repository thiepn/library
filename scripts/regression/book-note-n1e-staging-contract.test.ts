import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('N1E disposable PostgreSQL witness does not connect to real Account or external databases', () => {
  const script = readFileSync('scripts/qualification/book-notes-n1e-disposable-postgres.mjs', 'utf8');
  for (const expected of [
    'mkdtempSync(', "'initdb'", "'pg_ctl'", "'psql'",
    "listen_addresses=''", 'PGHOST:socket', "PGDATABASE:'postgres'",
    "rmSync(base,{recursive:true,force:true})",
    '20261006202154_library_first_party_sso_access.sql',
    '20261012093000_library_notebook_v2_downgrade_guard.sql',
    'LIBRARY_SYNC_CONFLICT_OR_VERSION_DOWNGRADE',
    'LIBRARY_DELETION_IN_PROGRESS',
    'LIBRARY_WRITE_NOT_GRANTED',
  ]) assert.ok(script.includes(expected), 'Witness missing: ' + expected);
  for (const unsafe of [
    'process.env.DATABASE_URL','process.env.PGPASSWORD','process.env.PGHOST',
    'process.env.SUPABASE_URL','process.env.SUPABASE_SERVICE_ROLE',
    'https://','http://',
  ]) assert.equal(script.includes(unsafe), false, 'Unexpected external connector: ' + unsafe);
});
