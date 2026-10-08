drop policy if exists library_file_deletion_authorizations_deny_client on public.library_file_deletion_authorizations;
create policy library_file_deletion_authorizations_deny_client
on public.library_file_deletion_authorizations
for all
to authenticated
using (false)
with check (false);

comment on policy library_file_deletion_authorizations_deny_client on public.library_file_deletion_authorizations is
  'Deletion locks are internal lifecycle state. Authenticated browser clients receive no direct table access; SECURITY DEFINER lifecycle functions own mutations.';
