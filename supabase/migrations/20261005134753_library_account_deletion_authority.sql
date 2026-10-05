-- Centralize destructive Library cloud-data deletion in THIEPN Account.
-- The function remains present for administrative compatibility, but browser clients
-- can no longer execute it directly.

revoke execute on function public.delete_thiepn_library_state() from authenticated;

comment on function public.delete_thiepn_library_state() is
  'Legacy Library direct-delete RPC retained for administrative compatibility. Signed-in clients use the THIEPN Account app-data deletion lifecycle instead.';
