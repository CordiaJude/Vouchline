-- ===== In-app notifications (Phase 11, transactional half -- MVP-CRITICAL) =====
-- Mirrors the existing transactional emails at the same trigger points
-- (intro request/accept/decline, connection confirmed) so the events
-- that already page someone by email also show up in-app. No RLS
-- policies: RPC-only, same pattern as connections/target_list_entries.
-- Inserts only ever happen from private.create_notification, called from
-- other security-definer functions/triggers -- never client-writable.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create or replace function private.create_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  values (p_user_id, p_kind, p_title, p_body, p_link)
$$;

-- ===== connection confirmed: notify both sides on the pending->confirmed
-- transition only, not on every subsequent update to the row =====
create or replace function private.notify_connection_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lo_name text;
  hi_name text;
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status <> 'confirmed') then
    select full_name into lo_name from public.profiles where id = new.user_lo;
    select full_name into hi_name from public.profiles where id = new.user_hi;

    perform private.create_notification(
      new.user_lo, 'connection_confirmed',
      coalesce(hi_name, 'Someone') || ' confirmed your connection',
      null, '/app/u/' || new.user_hi
    );
    perform private.create_notification(
      new.user_hi, 'connection_confirmed',
      coalesce(lo_name, 'Someone') || ' confirmed your connection',
      null, '/app/u/' || new.user_lo
    );
  end if;
  return new;
end;
$$;

create trigger connections_notify_confirmed after insert or update on public.connections
  for each row execute function private.notify_connection_confirmed();

-- ===== request_intro: notify the broker =====
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
  requester_name text;
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

  select full_name into requester_name from public.profiles where id = uid;
  perform private.create_notification(
    p_broker, 'intro_requested',
    coalesce(requester_name, 'Someone') || ' asked you for an intro',
    p_ask, '/app/intros/' || intro_id
  );

  return intro_id;
end;
$$;

-- ===== respond_intro_broker: notify the target on accept, the requester on decline =====
create or replace function public.respond_intro_broker(
  p_id uuid,
  p_accept boolean,
  p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  intro public.intro_requests;
  broker_name text;
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

  select full_name into broker_name from public.profiles where id = uid;
  if p_accept then
    perform private.create_notification(
      intro.target_id, 'intro_forwarded',
      coalesce(broker_name, 'Someone') || ' wants to introduce you',
      p_note, '/app/intros/' || p_id
    );
  else
    perform private.create_notification(
      intro.requester_id, 'intro_declined_broker',
      coalesce(broker_name, 'Your broker') || ' declined to make the intro',
      p_note, '/app/intros/' || p_id
    );
  end if;
end;
$$;

-- ===== respond_intro_target: notify requester + broker on accept, requester on decline =====
create or replace function public.respond_intro_target(
  p_id uuid,
  p_accept boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  intro public.intro_requests;
  target_name text;
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

  select full_name into target_name from public.profiles where id = uid;
  if p_accept then
    insert into public.events (user_id, name, props)
      values (uid, 'intro_accepted', jsonb_build_object('intro_id', p_id));

    perform private.create_notification(
      intro.requester_id, 'intro_accepted',
      coalesce(target_name, 'Your intro') || ' accepted the intro',
      null, '/app/intros/' || p_id
    );
    perform private.create_notification(
      intro.broker_id, 'intro_accepted',
      'The intro you made was accepted',
      null, '/app/intros/' || p_id
    );
  else
    perform private.create_notification(
      intro.requester_id, 'intro_declined_target',
      coalesce(target_name, 'The person you asked to meet') || ' declined the intro',
      null, '/app/intros/' || p_id
    );
  end if;
end;
$$;

-- ===== reading/managing notifications =====
create or replace function public.my_notifications()
returns table (id uuid, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, kind, title, body, link, read_at, created_at
  from public.notifications
  where user_id = (select auth.uid())
  order by created_at desc
  limit 50
$$;

create or replace function public.unread_notification_count()
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notifications
  where user_id = (select auth.uid()) and read_at is null
$$;

create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications set read_at = now()
    where id = p_id and user_id = uid and read_at is null;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.notifications set read_at = now()
    where user_id = uid and read_at is null;
end;
$$;

revoke all on function public.request_intro(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_intro_broker(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.respond_intro_target(uuid, boolean) from public, anon, authenticated;
revoke all on function public.my_notifications() from public, anon, authenticated;
revoke all on function public.unread_notification_count() from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;

grant execute on function public.request_intro(uuid, uuid, text) to authenticated;
grant execute on function public.respond_intro_broker(uuid, boolean, text) to authenticated;
grant execute on function public.respond_intro_target(uuid, boolean) to authenticated;
grant execute on function public.my_notifications() to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
