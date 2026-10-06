-- ===== reach score (Phase 3 "NEW FEATURE") =====
-- Cached, not computed live: refreshed on login (see the /auth/callback
-- route), not on every dashboard render.
alter table public.profiles
  add column reach_score int not null default 0,
  add column reach_score_updated_at timestamptz;

-- Distinct people reachable within 2 confirmed hops -- same reachability
-- logic as verified_path_counts() (0009_analytics.sql), but scoped to the
-- caller via auth.uid() instead of scanning every profile, since this is
-- called from the client on login rather than from a service-role cron.
create or replace function public.recompute_my_reach_score() returns int
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  score int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::int into score from (
    select dst as x from public.connection_edges where src = uid
    union
    select e2.dst as x from public.connection_edges e1
      join public.connection_edges e2 on e2.src = e1.dst
      where e1.src = uid and e2.dst <> uid
  ) reachable
  where not private.is_blocked_between(uid, x);

  update public.profiles set reach_score = score, reach_score_updated_at = now() where id = uid;

  return score;
end;
$$;

-- ===== dashboard stat bar =====
create or replace function public.dashboard_stats()
returns table (
  connections_count int,
  orgs_count int,
  open_intros_count int,
  pending_confirmations_count int
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.connections c
       where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid())) and c.status = 'confirmed'),
    (select count(*)::int from public.memberships m where m.user_id = (select auth.uid()) and m.status = 'active'),
    (select count(*)::int from public.intro_requests i
       where (i.requester_id = (select auth.uid()) or i.broker_id = (select auth.uid()) or i.target_id = (select auth.uid()))
         and i.status in ('pending_broker', 'pending_target')),
    (select count(*)::int from public.pending_for_me())
$$;

-- ===== "people you can reach" module =====
-- Phase 3 spec: "initially: random 3-5 with a path" -- a confirmed
-- 2-hop bridge exists, no direct edge yet. Personalization is Phase 11.
create or replace function public.dashboard_reachable_sample()
returns table (id uuid, full_name text, headline text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.headline
  from public.profiles p
  where p.id in (
    select e2.dst from public.connection_edges e1
      join public.connection_edges e2 on e2.src = e1.dst
      where e1.src = (select auth.uid()) and e2.dst <> (select auth.uid())
  )
  and p.deleted_at is null
  and not exists (
    select 1 from public.connection_edges d
      where d.src = (select auth.uid()) and d.dst = p.id
  )
  and not private.is_blocked_between((select auth.uid()), p.id)
  order by random()
  limit 5
$$;

-- ===== private activity feed =====
-- Utility log, not social content: connection confirmed, intro accepted
-- (both scoped to the viewer being a party to it), and new roster joins
-- in a shared org. No strength, no raw answers, nothing about anyone
-- outside what they'd already see elsewhere in the app.
create or replace function public.my_activity_feed()
returns table (kind text, headline text, happened_at timestamptz)
language sql stable security definer set search_path = '' as $$
  (
    select 'connection_confirmed', p.full_name, c.confirmed_at
    from public.connections c
    join public.profiles p
      on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
    where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
      and c.status = 'confirmed'
      and p.deleted_at is null
  )
  union all
  (
    select
      'intro_accepted',
      case
        when i.requester_id = (select auth.uid()) then rt.full_name
        when i.target_id = (select auth.uid()) then rq.full_name
        else rq.full_name || ' & ' || rt.full_name
      end,
      i.target_responded_at
    from public.intro_requests i
    join public.profiles rq on rq.id = i.requester_id
    join public.profiles rt on rt.id = i.target_id
    where (i.requester_id = (select auth.uid()) or i.broker_id = (select auth.uid()) or i.target_id = (select auth.uid()))
      and i.status = 'accepted'
  )
  union all
  (
    select 'roster_join', p.full_name, e.created_at
    from public.events e
    join public.profiles p on p.id = e.user_id
    where e.name = 'onboarded'
      and e.user_id <> (select auth.uid())
      and e.org_id in (select private.my_org_ids())
  )
  order by 3 desc
  limit 20
$$;

revoke all on function public.recompute_my_reach_score() from public, anon, authenticated;
revoke all on function public.dashboard_stats() from public, anon, authenticated;
revoke all on function public.dashboard_reachable_sample() from public, anon, authenticated;
revoke all on function public.my_activity_feed() from public, anon, authenticated;

grant execute on function public.recompute_my_reach_score() to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.dashboard_reachable_sample() to authenticated;
grant execute on function public.my_activity_feed() to authenticated;
