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

  if not exists (select 1 from public.connection_edges where src = uid and dst = p_broker) then
    raise exception 'no_edge_requester_broker';
  end if;
  if not exists (select 1 from public.connection_edges where src = p_broker and dst = p_target) then
    raise exception 'no_edge_broker_target';
  end if;
  if exists (select 1 from public.connection_edges where src = uid and dst = p_target) then
    raise exception 'already_directly_connected';
  end if;

  if not private.shares_org(p_target) then
    raise exception 'not_shared_org';
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

create or replace function public.respond_intro_broker(
  p_id uuid,
  p_accept boolean,
  p_note text
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
  if intro.broker_id <> uid then
    raise exception 'not_participant';
  end if;
  if intro.status <> 'pending_broker' then
    raise exception 'invalid_state';
  end if;
  if intro.expires_at < now() then
    raise exception 'expired';
  end if;

  update public.intro_requests set
    status = (case when p_accept then 'pending_target' else 'declined_broker' end)::public.intro_status,
    broker_responded_at = now(),
    broker_note = p_note
  where id = p_id;

  insert into public.events (user_id, name, props)
    values (uid, 'intro_broker_responded', jsonb_build_object('intro_id', p_id, 'accepted', p_accept));
end;
$$;

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

  insert into public.events (user_id, name, props)
    values (uid, 'intro_outcome', jsonb_build_object('intro_id', p_id, 'accepted', p_accept));
end;
$$;

create or replace function public.withdraw_intro(p_id uuid) returns void
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
  if intro.requester_id <> uid then
    raise exception 'not_participant';
  end if;
  if intro.status not in ('pending_broker', 'pending_target') then
    raise exception 'invalid_state';
  end if;

  update public.intro_requests set status = 'withdrawn' where id = p_id;
end;
$$;

-- Maintenance function: not a per-user RPC. Called by a scheduled job
-- (pg_cron if available, else the protected /api/cron/expire-intros
-- route hit by Vercel Cron) running as postgres/service role, so no
-- auth.uid() check and no grant to authenticated.
create or replace function public.expire_intros() returns void
language sql security definer set search_path = '' as $$
  update public.intro_requests
  set status = 'expired'
  where status in ('pending_broker', 'pending_target')
    and expires_at < now()
$$;

-- Rate limit for the AI draft server action (1 per 10s, 30/day per user),
-- using the existing events table rather than a dedicated counter table.
create or replace function public.check_and_log_ai_draft() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  recent_count int;
  daily_count int;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*) into recent_count from public.events
    where user_id = uid and name = 'ai_draft' and created_at > now() - interval '10 seconds';
  if recent_count > 0 then
    raise exception 'rate_limited_burst';
  end if;

  select count(*) into daily_count from public.events
    where user_id = uid and name = 'ai_draft' and created_at > now() - interval '1 day';
  if daily_count >= 30 then
    raise exception 'rate_limited_daily';
  end if;

  insert into public.events (user_id, name, props) values (uid, 'ai_draft', '{}'::jsonb);
end;
$$;

revoke all on function public.request_intro(uuid, uuid, text) from public;
revoke all on function public.respond_intro_broker(uuid, boolean, text) from public;
revoke all on function public.respond_intro_target(uuid, boolean) from public;
revoke all on function public.withdraw_intro(uuid) from public;
revoke all on function public.expire_intros() from public;
revoke all on function public.check_and_log_ai_draft() from public;

grant execute on function public.request_intro(uuid, uuid, text) to authenticated;
grant execute on function public.respond_intro_broker(uuid, boolean, text) to authenticated;
grant execute on function public.respond_intro_target(uuid, boolean) to authenticated;
grant execute on function public.withdraw_intro(uuid) to authenticated;
grant execute on function public.check_and_log_ai_draft() to authenticated;
-- expire_intros intentionally has no authenticated grant: only the
-- service-role-backed cron route should be able to call it.
grant execute on function public.expire_intros() to service_role;
