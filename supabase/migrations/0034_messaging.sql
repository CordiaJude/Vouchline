-- ===== Messaging =====
-- Two kinds of conversation:
--   intro  -- opened automatically when an intro is accepted: the
--             requester, the broker (who made the intro) and the target,
--             so the intro actually turns into a conversation.
--   direct -- one-to-one, between people who are confirmed connections or
--             accepted contacts (0031). Never between strangers.
--
-- Same model as the rest of the app: RLS on, every write through a
-- SECURITY DEFINER RPC. The one direct SELECT policy is on messages, for
-- members only, so Supabase Realtime can stream new messages to them.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('intro', 'direct')),
  intro_id uuid unique references public.intro_requests(id) on delete cascade,
  -- "lo:hi" user ids for direct chats, so each pair has exactly one.
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'intro') = (intro_id is not null)),
  check ((kind = 'direct') = (direct_key is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members(user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- null = a system line ("Maya introduced you to Leo")
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages(conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function private.is_conversation_member(p_conversation uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation and user_id = (select auth.uid())
  )
$$;

-- Members can read their conversation's messages (needed for Realtime).
create policy messages_select on public.messages for select to authenticated
  using (private.is_conversation_member(conversation_id));

-- Stream new messages over Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ===== intro chats: created on accept (and lazily for older intros) =====
create or replace function private.ensure_intro_conversation(p_intro uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  i public.intro_requests;
  conv uuid;
  requester_name text;
  target_name text;
  broker_name text;
begin
  select * into i from public.intro_requests where id = p_intro;
  if not found or i.status <> 'accepted' then
    return null;
  end if;

  select id into conv from public.conversations where intro_id = p_intro;
  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (kind, intro_id) values ('intro', p_intro)
    on conflict (intro_id) do nothing
    returning id into conv;
  if conv is null then
    select id into conv from public.conversations where intro_id = p_intro;
    return conv;
  end if;

  insert into public.conversation_members (conversation_id, user_id) values
    (conv, i.requester_id), (conv, i.broker_id), (conv, i.target_id)
    on conflict do nothing;

  select full_name into requester_name from public.profiles where id = i.requester_id;
  select full_name into target_name from public.profiles where id = i.target_id;
  select full_name into broker_name from public.profiles where id = i.broker_id;

  insert into public.messages (conversation_id, sender_id, body) values
    (conv, null, coalesce(broker_name, 'Your connection') || ' introduced ' ||
      coalesce(requester_name, 'someone') || ' and ' || coalesce(target_name, 'someone') ||
      '. Say hello!'),
    (conv, i.requester_id, i.ask);

  update public.conversations set last_message_at = now() where id = conv;
  return conv;
end;
$$;

create or replace function private.on_intro_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform private.ensure_intro_conversation(new.id);
  end if;
  return new;
end;
$$;

create trigger intro_accepted_conversation
  after update of status on public.intro_requests
  for each row execute function private.on_intro_accepted();

-- For the intro page's "Open chat" button (also covers intros accepted
-- before this migration).
create function public.open_intro_conversation(p_intro uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.intro_requests
    where id = p_intro and status = 'accepted'
      and uid in (requester_id, broker_id, target_id)
  ) then
    raise exception 'not_found';
  end if;
  return private.ensure_intro_conversation(p_intro);
end;
$$;

-- ===== direct chats =====
create function public.start_direct_conversation(p_other uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  key text;
  conv uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_other = uid then
    raise exception 'cannot_message_self';
  end if;
  if private.is_blocked_between(uid, p_other) then
    raise exception 'blocked';
  end if;
  -- Only people you actually know: a confirmed connection or an accepted
  -- contact. No cold DMs to strangers.
  if not private.has_confirmed_connection(p_other)
     and not exists (
       select 1 from public.contact_requests
       where status = 'accepted'
         and ((requester_id = uid and target_id = p_other) or (requester_id = p_other and target_id = uid))
     ) then
    raise exception 'not_connected';
  end if;

  key := least(uid, p_other)::text || ':' || greatest(uid, p_other)::text;
  select id into conv from public.conversations where direct_key = key;
  if conv is not null then
    return conv;
  end if;

  insert into public.conversations (kind, direct_key) values ('direct', key)
    on conflict (direct_key) do nothing
    returning id into conv;
  if conv is null then
    select id into conv from public.conversations where direct_key = key;
    return conv;
  end if;
  insert into public.conversation_members (conversation_id, user_id) values (conv, uid), (conv, p_other);
  return conv;
end;
$$;

-- ===== send =====
create function public.send_message(p_conversation uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  body text := trim(p_body);
  msg uuid;
  conv public.conversations;
  sender_name text;
  member record;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  if body = '' or char_length(body) > 4000 then
    raise exception 'invalid_body';
  end if;
  select * into conv from public.conversations where id = p_conversation;
  -- A block ends a direct chat (intro group chats stay readable).
  if conv.kind = 'direct' and exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id <> uid
      and private.is_blocked_between(uid, m.user_id)
  ) then
    raise exception 'blocked';
  end if;

  perform private.check_rate_limit('send_message:' || uid::text, 60, interval '1 minute');

  insert into public.messages (conversation_id, sender_id, body)
    values (p_conversation, uid, body)
    returning id into msg;
  update public.conversations set last_message_at = now() where id = p_conversation;
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = uid;

  -- One notification per conversation while it's unread (no spam per message).
  select full_name into sender_name from public.profiles where id = uid;
  for member in
    select m.user_id from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id <> uid
      and not exists (
        select 1 from public.notifications n
        where n.user_id = m.user_id and n.kind = 'new_message'
          and n.link = '/app/messages/' || p_conversation::text and n.read_at is null
      )
  loop
    perform private.create_notification(
      member.user_id, 'new_message',
      coalesce(sender_name, 'Someone') || ' sent you a message',
      left(body, 140),
      '/app/messages/' || p_conversation::text
    );
  end loop;

  return msg;
end;
$$;

-- ===== read =====
create function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = (select auth.uid());
  update public.notifications set read_at = now()
    where user_id = (select auth.uid()) and kind = 'new_message'
      and link = '/app/messages/' || p_conversation::text and read_at is null;
end;
$$;

-- Inbox: one row per conversation, newest first.
create function public.my_conversations()
returns table (
  id uuid,
  kind text,
  intro_id uuid,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  unread_count int,
  -- the other members, as [{id, full_name, avatar_url}]
  others jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.kind, c.intro_id, c.last_message_at,
    lm.body, lm.sender_id,
    (select count(*)::int from public.messages m
      where m.conversation_id = c.id and m.created_at > me.last_read_at
        and m.sender_id is distinct from me.user_id),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
                       order by p.full_name)
      from public.conversation_members om
      join public.profiles p on p.id = om.user_id and p.deleted_at is null
      where om.conversation_id = c.id and om.user_id <> me.user_id
    ), '[]'::jsonb)
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select m.body, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
  order by c.last_message_at desc
$$;

-- One conversation's messages, newest page first (pass p_before to page back).
create function public.conversation_messages(
  p_conversation uuid,
  p_before timestamptz default null,
  p_limit int default 50
)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  return query
    select m.id, m.sender_id, m.body, m.created_at
    from public.messages m
    where m.conversation_id = p_conversation
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

-- Header info for a conversation: kind, intro link, and the other members.
create function public.conversation_details(p_conversation uuid)
returns table (id uuid, kind text, intro_id uuid, others jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  return query
    select c.id, c.kind, c.intro_id,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url)
                         order by p.full_name)
        from public.conversation_members om
        join public.profiles p on p.id = om.user_id and p.deleted_at is null
        where om.conversation_id = c.id and om.user_id <> (select auth.uid())
      ), '[]'::jsonb)
    from public.conversations c
    where c.id = p_conversation;
end;
$$;

-- Badge count for the nav: conversations with anything unread.
create function public.unread_conversation_count()
returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.conversation_members me
  where me.user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.conversation_id = me.conversation_id
        and m.created_at > me.last_read_at
        and m.sender_id is distinct from me.user_id
    )
$$;

revoke all on function public.open_intro_conversation(uuid) from public, anon, authenticated;
revoke all on function public.start_direct_conversation(uuid) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;
revoke all on function public.conversation_messages(uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function public.conversation_details(uuid) from public, anon, authenticated;
revoke all on function public.unread_conversation_count() from public, anon, authenticated;

grant execute on function public.open_intro_conversation(uuid) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.conversation_messages(uuid, timestamptz, int) to authenticated;
grant execute on function public.conversation_details(uuid) to authenticated;
grant execute on function public.unread_conversation_count() to authenticated;
