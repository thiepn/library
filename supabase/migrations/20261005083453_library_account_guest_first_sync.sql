-- Library / THIEPN Account guest-first cloud sync.
-- Applied to the canonical THIEPN Account Supabase project.

insert into public.account_apps (slug, name, description, path, sort_order, active)
values ('library','Library','Local-first ebook library with private reading-state sync through THIEPN Account.','/library/',70,true)
on conflict (slug) do update set
  name=excluded.name,
  description=excluded.description,
  path=excluded.path,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

insert into public.account_app_manifests
  (app_slug,manifest_version,identity_scope,data_scope,export_scope,capabilities,core_app_id)
values (
  'library',1,'shared','isolated','app-owned',
  jsonb_build_object(
    'account',true,'sync',true,'cloud_saves',true,'export_data',true,
    'isolatedData',true,'sharedIdentity',true,'activityTracking',true,
    'guestFirst',true,'offlineFirst',true,'personalFilesUploaded',false
  ),
  null
)
on conflict (app_slug) do update set
  manifest_version=excluded.manifest_version,
  identity_scope=excluded.identity_scope,
  data_scope=excluded.data_scope,
  export_scope=excluded.export_scope,
  capabilities=excluded.capabilities,
  core_app_id=excluded.core_app_id,
  updated_at=now();

insert into public.account_app_permissions
  (app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active)
values
  ('library','identity.basic','Basic account identity','Use your stable THIEPN Account ID to link Library reading state across devices.',true,false,'basic',10,true),
  ('library','app_data.read','Read Library cloud state','Read your own private Library reading-state snapshot.',true,false,'basic',20,true),
  ('library','app_data.write','Update Library cloud state','Create and update your own private Library reading-state snapshot for cross-device sync.',true,false,'basic',30,true)
on conflict (app_slug,permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

create table if not exists public.library_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision>0),
  state jsonb not null
    check (jsonb_typeof(state)='object')
    check (octet_length(state::text)<=16777216),
  app_version text not null default '',
  device_id text,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.library_sync_state is
  'Owner-isolated Library reading-state snapshots. Personal EPUB/PDF bytes remain device-local and are never stored here.';

alter table public.library_sync_state enable row level security;

revoke all on table public.library_sync_state from authenticated, anon, public;
grant select on table public.library_sync_state to authenticated;

drop policy if exists library_sync_state_select_own on public.library_sync_state;
create policy library_sync_state_select_own
on public.library_sync_state
for select
to authenticated
using (
  (select auth.uid())=user_id
  and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
  and ((select auth.jwt())->>'client_id') is null
);

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
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'ANONYMOUS_IDENTITY_NOT_SUPPORTED' using errcode='42501';
  end if;
  if ((select auth.jwt())->>'client_id') is not null then
    raise exception 'DELEGATED_OAUTH_RAW_DATA_DENIED' using errcode='42501';
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

  if p_expected_revision is null then
    insert into public.library_sync_state(user_id,revision,state,app_version,device_id,client_updated_at)
    values(v_user_id,1,p_state,left(coalesce(p_app_version,''),64),
      nullif(left(coalesce(p_device_id,''),160),''),p_client_updated_at)
    on conflict(user_id) do nothing
    returning * into v_row;
    if not found then raise exception 'LIBRARY_SYNC_CONFLICT' using errcode='40001'; end if;
  else
    update public.library_sync_state
    set revision=revision+1,
        state=p_state,
        app_version=left(coalesce(p_app_version,''),64),
        device_id=nullif(left(coalesce(p_device_id,''),160),''),
        client_updated_at=p_client_updated_at,
        updated_at=now()
    where user_id=v_user_id and revision=p_expected_revision
    returning * into v_row;
    if not found then raise exception 'LIBRARY_SYNC_CONFLICT' using errcode='40001'; end if;
  end if;

  return jsonb_build_object(
    'revision',v_row.revision,'state',v_row.state,'app_version',v_row.app_version,
    'device_id',v_row.device_id,'client_updated_at',v_row.client_updated_at,'updated_at',v_row.updated_at
  );
end;
$function$;

revoke all on function public.sync_thiepn_library_state(bigint,jsonb,text,text,timestamptz) from public, anon;
grant execute on function public.sync_thiepn_library_state(bigint,jsonb,text,text,timestamptz) to authenticated;

create or replace function public.delete_thiepn_library_state()
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted boolean := false;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'ANONYMOUS_IDENTITY_NOT_SUPPORTED' using errcode='42501';
  end if;
  if ((select auth.jwt())->>'client_id') is not null then
    raise exception 'DELEGATED_OAUTH_RAW_DATA_DENIED' using errcode='42501';
  end if;
  delete from public.library_sync_state where user_id=v_user_id;
  v_deleted := found;
  return v_deleted;
end;
$function$;

revoke all on function public.delete_thiepn_library_state() from public, anon;
grant execute on function public.delete_thiepn_library_state() to authenticated;
