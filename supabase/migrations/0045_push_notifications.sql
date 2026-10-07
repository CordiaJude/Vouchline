-- ===== Phone / browser push notifications =====
-- 1. Each device that turns on notifications stores a push subscription.
-- 2. When a notification row is created (intros, connections, vouches...)
--    or a chat message is sent, the database asks the app to deliver a
--    push: pg_net POSTs to /api/push/dispatch with a shared secret. The
--    app looks up the person's devices, checks quiet hours, and sends.
-- The app URL and secret live in private.app_settings (set once, see
-- the bottom of this file). Until they're set, nothing is sent.

create extension if not exists pg_net with schema extensions;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy push_subscriptions_update on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Private key/value settings, readable only by definer functions.
create table if not exists private.app_settings (
  key text primary key,
  value text not null
);

-- Fire-and-forget push request (pg_net is async; never blocks the write).
create or replace function private.dispatch_push(p_users uuid[], p_title text, p_body text, p_url text, p_tag text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  dispatch_url text;
  secret text;
begin
  select value into dispatch_url from private.app_settings where key = 'push_dispatch_url';
  select value into secret from private.app_settings where key = 'push_dispatch_secret';
  if dispatch_url is null or secret is null or coalesce(cardinality(p_users), 0) = 0 then
    return;
  end if;
  -- Only bother when at least one recipient has a device registered.
  if not exists (select 1 from public.push_subscriptions where user_id = any (p_users)) then
    return;
  end if;
  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object('user_ids', to_jsonb(p_users), 'title', p_title, 'body', p_body, 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret)
  );
exception when others then
  -- A push problem must never break the action that triggered it.
  raise warning 'dispatch_push failed: %', sqlerrm;
end;
$$;

-- Every in-app notification also goes to the person's devices.
create or replace function private.push_on_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.dispatch_push(array[new.user_id], new.title, coalesce(new.body, ''), coalesce(new.link, '/app/notifications'), new.kind);
  return new;
end;
$$;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function private.push_on_notification();

-- New chat messages go to the other members (messages aren't
-- notifications in the app, but they should still buzz your phone).
create or replace function private.push_on_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sender text;
  recipients uuid[];
begin
  if new.sender_id is null then
    return new;
  end if;
  select full_name into sender from public.profiles where id = new.sender_id;
  select array_agg(m.user_id) into recipients
    from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
      and not private.is_blocked_between(m.user_id, new.sender_id);
  perform private.dispatch_push(
    recipients,
    coalesce(sender, 'New message'),
    case when new.body = '' and new.image_path is not null then 'Sent a photo' else left(new.body, 140) end,
    '/app/messages/' || new.conversation_id::text,
    'message:' || new.conversation_id::text
  );
  return new;
end;
$$;
create trigger messages_push
  after insert on public.messages
  for each row execute function private.push_on_message();

notify pgrst, 'reload schema';

-- ===== One-time setup (run separately, with your own values) =====
-- insert into private.app_settings (key, value) values
--   ('push_dispatch_url', 'https://vouchline.vercel.app/api/push/dispatch'),
--   ('push_dispatch_secret', '<same value as PUSH_DISPATCH_SECRET in Vercel>')
-- on conflict (key) do update set value = excluded.value;
