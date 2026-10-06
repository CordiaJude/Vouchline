-- ===== profile visibility: confirmed connections, not just shared orgs =====
-- Phase 2 removed the org-membership gate on connecting at all, but
-- profiles_select (from 0001_core.sql) still required id = self OR a
-- shared org to SELECT a profile -- so two people who connect without a
-- shared org could never actually view each other's profile afterward.
-- That's a real bug surfaced by this phase's profile pages, not new
-- scope: fix it the same way shares_org already works, via a
-- SECURITY DEFINER helper (a plain subquery on connection_edges inside
-- the policy would itself be blocked by connection_edges' own
-- no-policies RLS).
create or replace function private.has_confirmed_connection(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connection_edges where src = (select auth.uid()) and dst = other
  )
$$;

alter policy profiles_select on public.profiles
  using (
    deleted_at is null
    and (id = (select auth.uid()) or private.shares_org(id) or private.has_confirmed_connection(id))
  );

-- ===== mutual connections =====
-- People both the caller and p_other are confirmedly connected to.
create or replace function public.mutual_connections(p_other uuid)
returns table (id uuid, full_name text, headline text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.headline
  from public.connection_edges e1
  join public.connection_edges e2 on e2.dst = e1.dst and e2.src = p_other
  join public.profiles p on p.id = e1.dst and p.deleted_at is null
  where e1.src = (select auth.uid())
    and e1.dst <> (select auth.uid())
    and e1.dst <> p_other
    and not private.is_blocked_between((select auth.uid()), p.id)
$$;

-- ===== "how you're connected" strip =====
-- Confirmed connection info if one exists, else a claimed one (labeled
-- as such), else neither. Only the caller's own side of a confirmed
-- connection -- never eff_strength, lo_strength, or hi_strength.
create or replace function public.how_connected(p_other uuid)
returns table (
  kind text,
  category public.rel_type,
  is_former boolean,
  years smallint,
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  conn public.connections;
  claim public.claimed_connections;
  mutuals int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::int into mutuals from public.mutual_connections(p_other);

  select * into conn from public.connections
    where user_lo = least(uid, p_other) and user_hi = greatest(uid, p_other)
      and status = 'confirmed';

  if conn.id is not null then
    return query select
      'confirmed'::text,
      case when uid = conn.user_lo then conn.lo_type else conn.hi_type end,
      case when uid = conn.user_lo then conn.lo_is_former else conn.hi_is_former end,
      case when uid = conn.user_lo then conn.lo_years else conn.hi_years end,
      mutuals;
    return;
  end if;

  select * into claim from public.claimed_connections
    where claimant_id = uid and claimed_person_id = p_other
    order by created_at desc limit 1;

  if claim.id is not null then
    return query select 'claimed'::text, claim.category, claim.is_former, claim.years, mutuals;
    return;
  end if;

  return query select null::text, null::public.rel_type, null::boolean, null::smallint, mutuals;
end;
$$;

revoke all on function public.mutual_connections(uuid) from public, anon, authenticated;
revoke all on function public.how_connected(uuid) from public, anon, authenticated;

grant execute on function public.mutual_connections(uuid) to authenticated;
grant execute on function public.how_connected(uuid) to authenticated;
