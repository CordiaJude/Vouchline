-- ===== Messages are not notifications =====
-- Like Instagram: new messages show on the Messages badge
-- (unread_conversation_count), not in the Notifications list. 0034 also
-- created a "sent you a message" notification, so a chat you were
-- reading -- or had already read -- still showed up under the heart.
-- send_message stops creating them, and existing ones are cleared.

create or replace function public.send_message(p_conversation uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  body text := trim(p_body);
  msg uuid;
  conv public.conversations;
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

  return msg;
end;
$$;

delete from public.notifications where kind = 'new_message';

notify pgrst, 'reload schema';
