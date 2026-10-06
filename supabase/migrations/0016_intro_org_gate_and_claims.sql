-- ===== request_intro: drop the leftover org gate, accept claimed bridges =====
-- Two real gaps surfaced by this phase's find_brokers work:
--
-- 1. request_intro still had "not private.shares_org(p_target)", the same
--    org-membership gate that 0010_taxonomy_and_claims.sql already
--    removed from every other connect/discover RPC. Left in place, it
--    silently blocked intro requests to exactly the cross-org public
--    profiles Discover now surfaces.
-- 2. The requester->broker leg required a confirmed connection_edges
--    row, so a claimed-only bridge (just added to find_brokers, ranked
--    below confirmed per the spec) could be shown but never actually
--    used -- clicking "ask for an intro" always failed. The
--    broker->target leg still must be a confirmed edge: that's the only
--    signal a claim (private to the claimant) can never provide.
create or replace function public.request_intro(
  p_target uuid,
  p_broker uuid,
  p_ask text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  open_count int;
  weekly_count int;
  same_target_count int;
  broker_pending_count int;
  intro_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.connection_edges where src = uid and dst = p_broker)
     and not exists (
       select 1 from public.claimed_connections
       where claimant_id = uid and claimed_person_id = p_broker
     )
  then
    raise exception 'no_edge_requester_broker';
  end if;
  if not exists (select 1 from public.connection_edges where src = p_broker and dst = p_target) then
    raise exception 'no_edge_broker_target';
  end if;
  if exists (select 1 from public.connection_edges where src = uid and dst = p_target) then
    raise exception 'already_directly_connected';
  end if;

  if private.is_blocked_between(uid, p_broker)
     or private.is_blocked_between(uid, p_target)
     or private.is_blocked_between(p_broker, p_target) then
    raise exception 'blocked';
  end if;

  select count(*) into open_count from public.intro_requests
    where requester_id = uid and status in ('pending_broker', 'pending_target');
  if open_count >= 3 then
    raise exception 'too_many_open_requests';
  end if;

  select count(*) into weekly_count from public.intro_requests
    where requester_id = uid and created_at > now() - interval '7 days';
  if weekly_count >= 5 then
    raise exception 'weekly_limit_reached';
  end if;

  select count(*) into same_target_count from public.intro_requests
    where requester_id = uid and target_id = p_target and created_at > now() - interval '30 days';
  if same_target_count > 0 then
    raise exception 'already_requested_this_target';
  end if;

  select count(*) into broker_pending_count from public.intro_requests
    where broker_id = p_broker and status = 'pending_broker';
  if broker_pending_count >= 5 then
    raise exception 'broker_inbox_full';
  end if;

  insert into public.intro_requests (requester_id, broker_id, target_id, ask)
  values (uid, p_broker, p_target, p_ask)
  returning id into intro_id;

  insert into public.events (user_id, name, props)
    values (uid, 'intro_requested', jsonb_build_object('intro_id', intro_id, 'broker_id', p_broker, 'target_id', p_target));

  return intro_id;
end;
$$;

revoke all on function public.request_intro(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_intro(uuid, uuid, text) to authenticated;
