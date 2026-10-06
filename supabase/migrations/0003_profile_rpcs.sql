-- Account deletion needs to touch memberships and connections, neither of
-- which the caller can update directly under RLS, so it's one atomic RPC:
-- soft-delete the profile, drop active memberships, and revoke connections
-- (which also removes the now-stale rows from connection_edges via the
-- Phase 2 sync_edges trigger).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles set deleted_at = now()
  where id = uid and deleted_at is null;

  update public.memberships set status = 'removed'
  where user_id = uid and status = 'active';

  update public.connections set status = 'revoked'
  where status <> 'revoked' and (user_lo = uid or user_hi = uid);
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
