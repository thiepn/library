-- P1 Library Cloud Continuity: optional private personal-book file storage.
-- Reading-state sync remains independent; personal files require a separate sensitive Account grant.

update public.account_app_manifests
set capabilities = capabilities || jsonb_build_object(
      'personalFilesUploaded', true,
      'personalFileCloudOptional', true,
      'personalFileCloudMaxBytes', 52428800
    ),
    updated_at = now()
where app_slug='library';

insert into public.account_app_permissions
  (app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order,active)
values (
  'library',
  'personal_files.sync',
  'Personal book cloud',
  'Privately upload and download eligible personal EPUB/PDF files for cross-device Library continuity.',
  false,
  true,
  'sensitive',
  40,
  true
)
on conflict (app_slug,permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=excluded.active,
  updated_at=now();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'library-personal-books',
  'library-personal-books',
  false,
  52428800,
  array['application/epub+zip','application/pdf']::text[]
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.library_file_deletion_authorizations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id uuid not null references public.account_app_deletion_plans(id) on delete cascade,
  expected_revision bigint not null check (expected_revision >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.library_file_deletion_authorizations enable row level security;
revoke all on table public.library_file_deletion_authorizations from public, anon, authenticated;

create or replace function public.has_library_personal_file_sync_access()
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
    and ((select auth.jwt())->>'client_id') is null
    and exists (
      select 1
      from public.account_app_connections c
      where c.user_id=(select auth.uid())
        and c.app_slug='library'
        and c.status in ('connected','limited')
    )
    and exists (
      select 1
      from public.account_app_grants g
      where g.user_id=(select auth.uid())
        and g.app_slug='library'
        and g.permission_id='personal_files.sync'
        and g.status='granted'
    );
$function$;

revoke all on function public.has_library_personal_file_sync_access() from public, anon;
grant execute on function public.has_library_personal_file_sync_access() to authenticated;

create or replace function public.has_library_file_deletion_authorization(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false
    and ((select auth.jwt())->>'client_id') is null
    and (storage.foldername(p_object_name))[1]=(select auth.uid())::text
    and exists (
      select 1
      from public.library_file_deletion_authorizations a
      join public.account_app_deletion_plans p
        on p.id=a.plan_id
       and p.user_id=a.user_id
       and p.app_slug='library'
      where a.user_id=(select auth.uid())
        and a.expires_at>now()
        and p.expires_at>now()
        and jsonb_array_length(p.blockers)=0
        and (
          (a.expected_revision=0 and not exists (
            select 1 from public.library_sync_state s where s.user_id=a.user_id
          ))
          or exists (
            select 1
            from public.library_sync_state s
            where s.user_id=a.user_id and s.revision=a.expected_revision
          )
        )
    );
$function$;

revoke all on function public.has_library_file_deletion_authorization(text) from public, anon;
grant execute on function public.has_library_file_deletion_authorization(text) to authenticated;

create or replace function public.authorize_thiepn_library_file_deletion(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.account_app_deletion_plans%rowtype;
  v_expires timestamptz;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'ANONYMOUS_IDENTITY_NOT_SUPPORTED' using errcode='42501';
  end if;
  if ((select auth.jwt())->>'client_id') is not null then
    raise exception 'DELEGATED_OAUTH_RAW_DATA_DENIED' using errcode='42501';
  end if;

  perform private.account_assert_not_deletion_pending();
  perform private.account_require_recent_session(interval '10 minutes');

  select * into v_plan
  from public.account_app_deletion_plans p
  where p.id=p_plan_id
    and p.user_id=v_uid
    and p.app_slug='library'
  for update;

  if not found then raise exception 'LIBRARY_DELETION_PLAN_NOT_FOUND' using errcode='22023'; end if;
  if v_plan.expires_at<=now() then raise exception 'LIBRARY_DELETION_PLAN_STALE' using errcode='22023'; end if;
  if jsonb_array_length(v_plan.blockers)>0 then raise exception 'LIBRARY_DELETION_BLOCKED' using errcode='22023'; end if;

  if coalesce(v_plan.expected_revision,0)=0 then
    if exists (select 1 from public.library_sync_state s where s.user_id=v_uid) then
      raise exception 'LIBRARY_DELETION_CONFLICT' using errcode='40001';
    end if;
  elsif not exists (
    select 1 from public.library_sync_state s
    where s.user_id=v_uid and s.revision=v_plan.expected_revision
  ) then
    raise exception 'LIBRARY_DELETION_CONFLICT' using errcode='40001';
  end if;

  v_expires := least(v_plan.expires_at, now()+interval '5 minutes');
  insert into public.library_file_deletion_authorizations(user_id,plan_id,expected_revision,expires_at,created_at)
  values(v_uid,p_plan_id,coalesce(v_plan.expected_revision,0),v_expires,now())
  on conflict(user_id) do update set
    plan_id=excluded.plan_id,
    expected_revision=excluded.expected_revision,
    expires_at=excluded.expires_at,
    created_at=now();

  return jsonb_build_object(
    'authorized',true,
    'planId',p_plan_id,
    'expectedRevision',coalesce(v_plan.expected_revision,0),
    'expiresAt',v_expires
  );
end;
$function$;

revoke all on function public.authorize_thiepn_library_file_deletion(uuid) from public, anon;
grant execute on function public.authorize_thiepn_library_file_deletion(uuid) to authenticated;

drop policy if exists library_personal_books_select_own on storage.objects;
create policy library_personal_books_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id='library-personal-books'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and storage.filename(name) ~ '^[0-9a-f]{64}\.(epub|pdf)$'
  and (
    (select public.has_library_personal_file_sync_access())
    or (select public.has_library_file_deletion_authorization(name))
  )
);

drop policy if exists library_personal_books_insert_own on storage.objects;
create policy library_personal_books_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id='library-personal-books'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and storage.filename(name) ~ '^[0-9a-f]{64}\.(epub|pdf)$'
  and (select public.has_library_personal_file_sync_access())
);

drop policy if exists library_personal_books_delete_planned on storage.objects;
create policy library_personal_books_delete_planned
on storage.objects
for delete
to authenticated
using (
  bucket_id='library-personal-books'
  and (select public.has_library_file_deletion_authorization(name))
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
  if exists (
    select 1 from public.library_file_deletion_authorizations a
    where a.user_id=v_user_id and a.expires_at>now()
  ) then
    raise exception 'LIBRARY_DELETION_IN_PROGRESS' using errcode='55000';
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

comment on table public.library_file_deletion_authorizations is
  'Short-lived recent-auth deletion locks for Library personal-file storage; ordinary Library clients cannot read or write this table.';
comment on function public.has_library_personal_file_sync_access() is
  'Checks active native THIEPN Account Library connection plus the optional sensitive personal_files.sync grant.';
comment on function public.authorize_thiepn_library_file_deletion(uuid) is
  'Creates a short-lived deletion lock only for an owner-scoped, unexpired Library deletion plan after recent authentication.';
