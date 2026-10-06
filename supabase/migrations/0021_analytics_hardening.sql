-- ===== Phase 14 (Analytics backend) review: log_event is a public RPC,
-- callable directly by any authenticated client via supabase-js/PostgREST
-- -- not only from the app's own server code. Its event-name whitelist
-- stops junk event *names*, but p_props was passed through unvalidated,
-- and admin_metric_path_coverage casts props->>'broker_count' straight to
-- int. A client calling log_event('find_brokers_run', {broker_count:
-- 'x'}) directly would poison a row that later throws a cast error and
-- breaks that metric for every admin viewing the dashboard. Fixed at both
-- ends: log_event now validates props shape per event name, and the
-- metric read is cast-safe regardless (defense in depth for any row
-- already in the table, and for the trigger-inserted event names, which
-- aren't client-writable at all so weren't part of the gap themselves).
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
  if p_name in ('signup', 'onboarded') and p_props <> '{}'::jsonb then
    raise exception 'invalid_event_props';
  end if;
  if p_name = 'find_brokers_run' and (
    not (p_props ? 'broker_count')
    or jsonb_typeof(p_props->'broker_count') <> 'number'
    or (p_props->>'broker_count')::numeric < 0
  ) then
    raise exception 'invalid_event_props';
  end if;

  perform private.check_rate_limit('log_event:' || uid::text, 60, interval '1 minute');

  select org_id into org from public.memberships
    where user_id = uid and status = 'active' order by created_at limit 1;

  insert into public.events (user_id, org_id, name, props) values (uid, org, p_name, p_props);
end;
$$;

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

  select
    count(*),
    count(*) filter (
      where jsonb_typeof(props->'broker_count') = 'number'
        and (props->>'broker_count')::numeric >= 1
    )
    into total, covered
  from public.events
  where org_id = p_org and name = 'find_brokers_run';

  if total = 0 then
    return 0;
  end if;
  return round(100.0 * covered / total, 1);
end;
$$;

revoke all on function public.log_event(text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_metric_path_coverage(uuid) from public, anon, authenticated;

grant execute on function public.log_event(text, jsonb) to authenticated;
grant execute on function public.admin_metric_path_coverage(uuid) to authenticated;
