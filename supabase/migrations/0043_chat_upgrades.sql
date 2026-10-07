-- ===== Chat upgrades: photos, unsend, "Seen" =====

-- ----- message columns -----
alter table public.messages
  add column image_path text check (char_length(image_path) <= 300),
  add column unsent_at timestamptz;

-- A message is text, a photo, or both -- and an unsent one is emptied.
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_content_check check (
  char_length(body) <= 4000
  and (unsent_at is not null or char_length(body) >= 1 or image_path is not null)
);

-- ----- photo storage: private bucket, one folder per conversation -----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only members of the conversation (the first folder in the path) can
-- upload to it or view its photos.
drop policy if exists chat_images_member_read on storage.objects;
create policy chat_images_member_read on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists chat_images_member_write on storage.objects;
create policy chat_images_member_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and private.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

-- ----- send: text and/or a photo -----
drop function if exists public.send_message(uuid, text);
create function public.send_message(p_conversation uuid, p_body text, p_image_path text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  body text := trim(coalesce(p_body, ''));
  img text := nullif(trim(coalesce(p_image_path, '')), '');
  msg uuid;
  conv public.conversations;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  if (body = '' and img is null) or char_length(body) > 4000 then
    raise exception 'invalid_body';
  end if;
  -- Photos must live in this conversation's folder.
  if img is not null and split_part(img, '/', 1) <> p_conversation::text then
    raise exception 'invalid_image';
  end if;
  select * into conv from public.conversations where id = p_conversation;
  if conv.kind = 'direct' and exists (
    select 1 from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id <> uid
      and private.is_blocked_between(uid, m.user_id)
  ) then
    raise exception 'blocked';
  end if;

  perform private.check_rate_limit('send_message:' || uid::text, 60, interval '1 minute');

  insert into public.messages (conversation_id, sender_id, body, image_path)
    values (p_conversation, uid, body, img)
    returning id into msg;
  update public.conversations set last_message_at = now() where id = p_conversation;
  update public.conversation_members set last_read_at = now()
    where conversation_id = p_conversation and user_id = uid;
  return msg;
end;
$$;

-- ----- unsend: your own message, any time -----
-- Clears the text and drops the photo from the message. (Supabase doesn't
-- allow deleting Storage files from SQL; the file is no longer linked
-- anywhere in the app.)
create function public.unsend_message(p_message uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.messages
     set body = '', image_path = null, unsent_at = now()
   where id = p_message and sender_id = (select auth.uid()) and unsent_at is null;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- ----- read lists include photo/unsent state -----
drop function if exists public.conversation_messages(uuid, timestamptz, int);
create function public.conversation_messages(
  p_conversation uuid,
  p_before timestamptz default null,
  p_limit int default 50
)
returns table (id uuid, sender_id uuid, body text, created_at timestamptz, image_path text, unsent boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  return query
    select m.id, m.sender_id, m.body, m.created_at, m.image_path, m.unsent_at is not null
    from public.messages m
    where m.conversation_id = p_conversation
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

-- "Seen": when each other member last read the chat.
create function public.conversation_read_state(p_conversation uuid)
returns table (user_id uuid, last_read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_conversation_member(p_conversation) then
    raise exception 'not_found';
  end if;
  return query
    select m.user_id, m.last_read_at from public.conversation_members m
    where m.conversation_id = p_conversation and m.user_id <> (select auth.uid());
end;
$$;

-- Inbox preview text for photos and unsent messages.
drop function if exists public.my_conversations();
create function public.my_conversations()
returns table (
  id uuid,
  kind text,
  intro_id uuid,
  last_message_at timestamptz,
  last_body text,
  last_sender_id uuid,
  unread_count int,
  others jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    c.id, c.kind, c.intro_id, c.last_message_at,
    case
      when lm.unsent_at is not null then 'Unsent a message'
      when lm.image_path is not null and lm.body = '' then 'Sent a photo'
      else lm.body
    end,
    lm.sender_id,
    (select count(*)::int from public.messages m
      where m.conversation_id = c.id and m.created_at > me.last_read_at
        and m.sender_id is distinct from me.user_id and m.unsent_at is null),
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
    select m.body, m.sender_id, m.image_path, m.unsent_at from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
  order by c.last_message_at desc
$$;

-- Realtime also streams unsends (UPDATE) to members.
alter table public.messages replica identity full;

revoke all on function public.send_message(uuid, text, text) from public, anon, authenticated;
revoke all on function public.unsend_message(uuid) from public, anon, authenticated;
revoke all on function public.conversation_messages(uuid, timestamptz, int) from public, anon, authenticated;
revoke all on function public.conversation_read_state(uuid) from public, anon, authenticated;
revoke all on function public.my_conversations() from public, anon, authenticated;

grant execute on function public.send_message(uuid, text, text) to authenticated;
grant execute on function public.unsend_message(uuid) to authenticated;
grant execute on function public.conversation_messages(uuid, timestamptz, int) to authenticated;
grant execute on function public.conversation_read_state(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;

notify pgrst, 'reload schema';
