import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261012093000_library_notebook_v2_downgrade_guard.sql', 'utf8');
const account = readFileSync('src/lib/account/sync.ts', 'utf8');

/** Source-contract audit only. This does NOT execute PostgreSQL or prove RLS runtime isolation. */
test('N1D source-only notebook sync RPC retains identity, grant and transactional CAS guards', () => {
  for (const contract of [
    'AUTH_REQUIRED',
    'ANONYMOUS_IDENTITY_NOT_SUPPORTED',
    'DELEGATED_OAUTH_RAW_DATA_DENIED',
    'LIBRARY_APP_NOT_CONNECTED',
    'LIBRARY_WRITE_NOT_GRANTED',
    "g.permission_id='app_data.write'",
    'LIBRARY_STATE_TOO_LARGE',
    'user_id=v_user_id and revision=p_expected_revision',
    "coalesce((state->>'schemaVersion')::integer,0) <= v_incoming_version",
    'LIBRARY_SYNC_CONFLICT_OR_VERSION_DOWNGRADE',
    'on conflict(user_id) do nothing',
  ]) {
    assert.ok(sql.includes(contract), 'Missing source guard: ' + contract);
  }
  assert.match(sql, /security definer\s+set search_path=''/);
  assert.match(sql, /revoke all on function public\.sync_thiepn_library_state[^;]+from public, anon/);
});

test('N1D V2 source guard rejects missing fields, downgrade and duplicate notebook IDs', () => {
  for (const contract of [
    'LIBRARY_V1_CANNOT_CONTAIN_NOTEBOOK_DATA',
    'LIBRARY_V2_NOTEBOOK_COLLECTION_REQUIRED',
    'LIBRARY_V2_NOTEBOOK_RECORD_INVALID',
    'LIBRARY_V2_NOTEBOOK_DUPLICATE_ID',
    'LIBRARY_V2_NOTEBOOK_DUPLICATE_SCOPE',
    "coalesce(n.value->>'scope','') not in",
    "jsonb_typeof(n.value->'bodyMarkdown') is distinct from 'string'",
    "jsonb_typeof(n.value->'sourceAnnotations') is distinct from 'array'",
    "jsonb_typeof(n.value->'revision') is distinct from 'number'",
    "jsonb_typeof(n.value->'createdAt') is distinct from 'string'",
  ]) {
    assert.ok(sql.includes(contract), 'Missing schema guard: ' + contract);
  }
  for (const contract of [
    'assertNotebookSyncProtocol()',
    "library_note_sync_capabilities",
    'notebook_rollback_guard',
    "server V2",
  ]) {
    assert.ok(account.includes(contract), 'Missing fail-closed client capability: ' + contract);
  }
});
