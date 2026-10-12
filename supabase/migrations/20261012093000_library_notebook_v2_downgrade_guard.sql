-- N1C: add explicit V2 notebook capability and prevent old clients from deleting notebooks.
-- Source-only migration: never execute against production without owner approval and
-- independent Account/Supabase review of existing permission and RLS contracts.
create or replace function public.library_note_sync_capabilities()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  return jsonb_build_object('library_backup_schema',2,'notebook_rollback_guard',true,
    'revision_cas',true,'format','thiepn-library-backup');
end;
$$;
revoke all on function public.library_note_sync_capabilities() from public, anon;
grant execute on function public.library_note_sync_capabilities() to authenticated;

create or replace function public.sync_thiepn_library_state(
  p_expected_revision bigint,
  p_state jsonb,
  p_app_version text default '',
  p_device_id text default null,
  p_client_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_row public.library_sync_state%rowtype;
  v_incoming_version integer;
  v_notes jsonb;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'ANONYMOUS_IDENTITY_NOT_SUPPORTED' using errcode='42501';
  end if;
  if ((select auth.jwt())->>'client_id') is not null then
    raise exception 'DELEGATED_OAUTH_RAW_DATA_DENIED' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.account_app_connections c
    where c.user_id=v_user_id
      and c.app_slug='library'
      and c.status in ('connected','limited')
  ) then
    raise exception 'LIBRARY_APP_NOT_CONNECTED' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.account_app_grants g
    where g.user_id=v_user_id
      and g.app_slug='library'
      and g.permission_id='app_data.write'
      and g.status='granted'
  ) then
    raise exception 'LIBRARY_WRITE_NOT_GRANTED' using errcode='42501';
  end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' then
    raise exception 'INVALID_LIBRARY_STATE' using errcode='22023';
  end if;
  if octet_length(p_state::text)>16777216 then
    raise exception 'LIBRARY_STATE_TOO_LARGE' using errcode='22001';
  end if;
  if p_expected_revision is not null and p_expected_revision<1 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode='22023';
  end if;
  if p_client_updated_at is not null and p_client_updated_at>now()+interval '1 day' then
    raise exception 'INVALID_CLIENT_UPDATED_AT' using errcode='22023';
  end if;

  if p_state->>'format' is distinct from 'thiepn-library-backup' then
    raise exception 'INVALID_LIBRARY_BACKUP_FORMAT' using errcode='22023';
  end if;
  if p_state->>'schemaVersion' is null or p_state->>'schemaVersion' not in ('1','2')
     or jsonb_typeof(p_state->'state') is distinct from 'object' then
    raise exception 'UNSUPPORTED_LIBRARY_BACKUP_VERSION' using errcode='22023';
  end if;
  v_incoming_version := (p_state->>'schemaVersion')::integer;
  if v_incoming_version = 1
     and (p_state #> '{state,main,noteDocuments}') is not null then
    raise exception 'LIBRARY_V1_CANNOT_CONTAIN_NOTEBOOK_DATA' using errcode='22023';
  end if;
  if v_incoming_version = 2 then
    v_notes := p_state #> '{state,main,noteDocuments,records}';
    if v_notes is null or jsonb_typeof(v_notes) <> 'array' then
      raise exception 'LIBRARY_V2_NOTEBOOK_COLLECTION_REQUIRED' using errcode='22023';
    end if;
    if jsonb_array_length(v_notes) > 100000 then
      raise exception 'LIBRARY_NOTEBOOK_COLLECTION_TOO_LARGE' using errcode='22001';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_notes) as n(value)
      where jsonb_typeof(n.value) <> 'object'
         or n.value->>'schemaVersion' is distinct from '1'
         or nullif(n.value->>'id','') is null
         or nullif(n.value->>'workId','') is null
         or coalesce(n.value->>'scope','') not in ('book-overview','chapter-summary','reading-note')
         or jsonb_typeof(n.value->'bodyMarkdown') is distinct from 'string'
         or jsonb_typeof(n.value->'sourceAnnotations') is distinct from 'array'
         or jsonb_typeof(n.value->'revision') is distinct from 'number'
         or jsonb_typeof(n.value->'createdAt') is distinct from 'string'
         or jsonb_typeof(n.value->'updatedAt') is distinct from 'string'
    ) then raise exception 'LIBRARY_V2_NOTEBOOK_RECORD_INVALID' using errcode='22023'; end if;
    if exists (select 1 from jsonb_array_elements(v_notes) as n(value)
      group by n.value->>'id' having count(*) > 1) then
      raise exception 'LIBRARY_V2_NOTEBOOK_DUPLICATE_ID' using errcode='22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_notes) as n(value)
      where n.value->>'scopeKey' is not null
      group by n.value->>'workId', n.value->>'scopeKey' having count(*) > 1) then
      raise exception 'LIBRARY_V2_NOTEBOOK_DUPLICATE_SCOPE' using errcode='22023';
    end if;
  end if;

  if p_expected_revision is null then
    insert into public.library_sync_state(user_id,revision,state,app_version,device_id,client_updated_at)
    values(v_user_id,1,p_state,left(coalesce(p_app_version,''),64),
      nullif(left(coalesce(p_device_id,''),160),''),p_client_updated_at)
    on conflict(user_id) do nothing
    returning * into v_row;
    if not found then raise exception 'LIBRARY_SYNC_CONFLICT' using errcode='40001'; end if;
  else
    -- Never allow V1 clients to downgrade a committed V2 notebook snapshot.
    -- The row lock in this UPDATE makes the revision and downgrade checks atomic.
    update public.library_sync_state
    set revision=revision+1,
        state=p_state,
        app_version=left(coalesce(p_app_version,''),64),
        device_id=nullif(left(coalesce(p_device_id,''),160),''),
        client_updated_at=p_client_updated_at,
        updated_at=now()
    where user_id=v_user_id and revision=p_expected_revision
      and (
        coalesce((state->>'schemaVersion')::integer,0) <= v_incoming_version
      )
    returning * into v_row;
    if not found then raise exception 'LIBRARY_SYNC_CONFLICT_OR_VERSION_DOWNGRADE' using errcode='40001'; end if;
  end if;

  return jsonb_build_object(
    'revision',v_row.revision,'state',v_row.state,'app_version',v_row.app_version,
    'device_id',v_row.device_id,'client_updated_at',v_row.client_updated_at,'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.sync_thiepn_library_state(bigint,jsonb,text,text,timestamptz) from public, anon;

grant execute on function public.sync_thiepn_library_state(bigint,jsonb,text,text,timestamptz) to authenticated;
