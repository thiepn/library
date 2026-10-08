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
    and not exists (
      select 1
      from public.library_file_deletion_authorizations a
      where a.user_id=(select auth.uid())
        and a.expires_at>now()
    )
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

comment on function public.has_library_personal_file_sync_access() is
  'Checks active native THIEPN Account Library connection plus the optional sensitive personal_files.sync grant and denies new file sync while an Account-authorized Library deletion lock is active.';