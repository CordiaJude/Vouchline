-- ===== event logging =====
-- Whitelisted so the client can never write an arbitrary event name into
-- a table every metric function trusts. org_id is derived server-side
-- (first active membership) rather than taken as a client-supplied
-- argument, since this is a single-chapter pilot; a multi-org caller's
-- event is simply attributed to their first org.
create or replace function public.log_event(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  org uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_name not in ('signup', 'onboarded', 'find_brokers_run') then
    raise exception 'invalid_event_name';
  end if;

  perform private.check_rate_limit('log_event:' || uid::text, 60, interval '1 minute');

  select org_id into org from public.memberships
    where user_id = uid and status = 'active' order by created_at limit 1;

  insert into public.events (user_id, org_id, name, props) values (uid, org, p_name, p_props);
end;
$$;

-- ===== connection_confirmed: fired once, on the transition into
-- confirmed, not on every subsequent edge resync =====
create or replace function private.sync_edges() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connection_edges where connection_id = new.id;
  if new.status = 'confirmed' then
    insert into public.connection_edges(src,dst,connection_id,eff_type,eff_years,eff_strength) values
      (new.user_lo,new.user_hi,new.id,new.eff_type,new.eff_years,new.eff_strength),
      (new.user_hi,new.user_lo,new.id,new.eff_type,new.eff_years,new.eff_strength);

    if tg_op = 'INSERT' or old.status is distinct from 'confirmed' then
      insert into public.events (user_id, name, props)
        values (new.initiated_by, 'connection_confirmed', jsonb_build_object('connection_id', new.id));
    end if;
  end if;
  return new;
end;
$$;

-- ===== respond_intro_target: log 'intro_accepted' only on accept, not
-- on decline, so path-coverage-style funnel metrics aren't muddied by a
-- generic 'intro_outcome' name covering both outcomes =====
create or replace function public.respond_intro_target(
  p_id uuid,
  p_accept boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  intro public.intro_requests;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into intro from public.intro_requests where id = p_id;
  if intro.id is null then
    raise exception 'not_found';
  end if;
  if intro.target_id <> uid then
    raise exception 'not_participant';
  end if;
  if intro.status <> 'pending_target' then
    raise exception 'invalid_state';
  end if;
  if intro.expires_at < now() then
    raise exception 'expired';
  end if;

  update public.intro_requests set
    status = (case when p_accept then 'accepted' else 'declined_target' end)::public.intro_status,
    target_responded_at = now()
  where id = p_id;

  if p_accept then
    insert into public.events (user_id, name, props)
      values (uid, 'intro_accepted', jsonb_build_object('intro_id', p_id));
  end if;
end;
$$;

-- ===== outcome follow-up support =====
alter table public.intro_requests
  add column outcome_reported_at timestamptz,
  add column outcome_talked boolean,
  add column outcome_followup_sent_at timestamptz;

create or replace function public.report_intro_outcome(p_id uuid, p_talked boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  intro public.intro_requests;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into intro from public.intro_requests where id = p_id;
  if intro.id is null then
    raise exception 'not_found';
  end if;
  if uid not in (intro.requester_id, intro.target_id) then
    raise exception 'not_participant';
  end if;
  if intro.status <> 'accepted' then
    raise exception 'invalid_state';
  end if;
  if intro.outcome_reported_at is not null then
    raise exception 'already_reported';
  end if;

  update public.intro_requests
    set outcome_reported_at = now(), outcome_talked = p_talked
    where id = p_id;

  insert into public.events (user_id, name, props)
    values (uid, 'intro_outcome_reported', jsonb_build_object('intro_id', p_id, 'talked', p_talked));
end;
$$;

-- ===== cron-support RPCs (service_role only) =====
create or replace function public.intros_needing_followup()
returns table (id uuid, requester_id uuid, target_id uuid, target_responded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, requester_id, target_id, target_responded_at
  from public.intro_requests
  where status = 'accepted'
    and outcome_reported_at is null
    and outcome_followup_sent_at is null
    and target_responded_at <= now() - interval '7 days'
$$;

create or replace function public.mark_followup_sent(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.intro_requests set outcome_followup_sent_at = now() where id = p_id
$$;

-- Distinct people each user has a verified path to: direct connections
-- plus one-broker-hop connections (the same reachability find_brokers()
-- checks), minus anyone blocked either direction. Used by the weekly
-- digest cron, not by any client -- so no per-row auth.uid() context is
-- needed and it can scan every profile directly.
create or replace function public.verified_path_counts()
returns table (user_id uuid, path_count int)
language sql stable security definer set search_path = '' as $$
  select p.id, (
    select count(*)::int from (
      select dst as x from public.connection_edges where src = p.id
      union
      select e2.dst as x from public.connection_edges e1
        join public.connection_edges e2 on e2.src = e1.dst
        where e1.src = p.id and e2.dst <> p.id
    ) reachable
    where not private.is_blocked_between(p.id, x)
  )
  from public.profiles p
  where p.deleted_at is null
$$;

-- ===== admin-only pilot metrics =====
-- grad_year is null or in the future relative to now -> student;
-- otherwise alumni. Matches the project's own onboarding convention that
-- grad_year is an expected, not necessarily past, graduation year.
create or replace function public.admin_metric_activation(p_org uuid)
returns table (grad_year int, member_count int, activated_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  return query
    select p.grad_year, count(*)::int,
      count(*) filter (where exists (
        select 1 from public.connection_edges e where e.src = p.id
      ))::int
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and m.status = 'active'
    group by p.grad_year
    order by p.grad_year nulls last;
end;
$$;

create or replace function public.admin_metric_median_edges(p_org uuid)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  result numeric;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  select percentile_cont(0.5) within group (order by edge_count) into result
  from (
    select coalesce((select count(*) from public.connection_edges e where e.src = m.user_id), 0) as edge_count
    from public.memberships m
    where m.org_id = p_org and m.status = 'active'
  ) counts;

  return coalesce(result, 0);
end;
$$;

-- Share of find_brokers_run events, for this org, where at least one
-- broker was found -- i.e. the search actually surfaced a path.
create or replace function public.admin_metric_path_coverage(p_org uuid)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  total int;
  covered int;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  select count(*), count(*) filter (where (props->>'broker_count')::int >= 1)
    into total, covered
  from public.events
  where org_id = p_org and name = 'find_brokers_run';

  if total = 0 then
    return 0;
  end if;
  return round(100.0 * covered / total, 1);
end;
$$;

create or replace function public.admin_metric_intro_participation(p_org uuid)
returns table (cohort text, member_count int, with_request_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  return query
    select
      case when p.grad_year is null or p.grad_year >= extract(year from now())
        then 'student' else 'alumni' end as cohort,
      count(*)::int,
      count(*) filter (where exists (
        select 1 from public.intro_requests i where i.requester_id = p.id
      ))::int
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    where m.org_id = p_org and m.status = 'active'
    group by 1;
end;
$$;

-- Among requests a broker has actually acted on (accepted or declined --
-- excludes ones still sitting unanswered or expired unanswered), the
-- share answered within 72h.
create or replace function public.admin_metric_broker_response_72h(p_org uuid)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  total int;
  within_window int;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  select count(*), count(*) filter (where broker_responded_at - created_at <= interval '72 hours')
    into total, within_window
  from public.intro_requests i
  where broker_responded_at is not null
    and i.broker_id in (select user_id from public.memberships where org_id = p_org and status = 'active');

  if total = 0 then
    return 0;
  end if;
  return round(100.0 * within_window / total, 1);
end;
$$;

-- accepted / (all requests minus withdrawn), scoped to org by requester.
create or replace function public.admin_metric_completion_rate(p_org uuid)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  denom int;
  accepted int;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  select count(*) filter (where status <> 'withdrawn'), count(*) filter (where status = 'accepted')
    into denom, accepted
  from public.intro_requests i
  where i.requester_id in (select user_id from public.memberships where org_id = p_org and status = 'active');

  if denom = 0 then
    return 0;
  end if;
  return round(100.0 * accepted / denom, 1);
end;
$$;

create or replace function public.admin_metric_outcomes(p_org uuid)
returns table (talked int, did_not_talk int, no_response int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  return query
    select
      count(*) filter (where outcome_talked = true)::int,
      count(*) filter (where outcome_talked = false)::int,
      count(*) filter (where outcome_reported_at is null)::int
    from public.intro_requests i
    where status = 'accepted'
      and i.requester_id in (select user_id from public.memberships where org_id = p_org and status = 'active');
end;
$$;

revoke all on function public.log_event(text, jsonb) from public, anon, authenticated;
revoke all on function public.report_intro_outcome(uuid, boolean) from public, anon, authenticated;
revoke all on function public.intros_needing_followup() from public, anon, authenticated;
revoke all on function public.mark_followup_sent(uuid) from public, anon, authenticated;
revoke all on function public.verified_path_counts() from public, anon, authenticated;
revoke all on function public.admin_metric_activation(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_median_edges(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_path_coverage(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_intro_participation(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_broker_response_72h(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_completion_rate(uuid) from public, anon, authenticated;
revoke all on function public.admin_metric_outcomes(uuid) from public, anon, authenticated;

grant execute on function public.log_event(text, jsonb) to authenticated;
grant execute on function public.report_intro_outcome(uuid, boolean) to authenticated;
grant execute on function public.admin_metric_activation(uuid) to authenticated;
grant execute on function public.admin_metric_median_edges(uuid) to authenticated;
grant execute on function public.admin_metric_path_coverage(uuid) to authenticated;
grant execute on function public.admin_metric_intro_participation(uuid) to authenticated;
grant execute on function public.admin_metric_broker_response_72h(uuid) to authenticated;
grant execute on function public.admin_metric_completion_rate(uuid) to authenticated;
grant execute on function public.admin_metric_outcomes(uuid) to authenticated;
-- service_role-only: cron support functions, never callable by a client.
grant execute on function public.intros_needing_followup() to service_role;
grant execute on function public.mark_followup_sent(uuid) to service_role;
grant execute on function public.verified_path_counts() to service_role;
