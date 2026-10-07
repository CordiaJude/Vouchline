create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- A and B are confirmed connections. C is A's target via broker B.
-- S is a stranger to everyone.
do $$
declare
  a uuid := 'f0000001-0000-0000-0000-000000000001';
  b uuid := 'f0000001-0000-0000-0000-000000000002';
  c uuid := 'f0000001-0000-0000-0000-000000000003';
  s uuid := 'f0000001-0000-0000-0000-000000000004';
  uid_ uuid;
  cid uuid;
begin
  foreach uid_ in array array[a,b,c,s]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid_, 'User ' || right(uid_::text, 1), true);
  end loop;

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(a,b), greatest(a,b), a, 'qr', 3, 2, now(), 3, 2, now()) returning id into cid;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (cid, 'lo', 'friend', true), (cid, 'hi', 'friend', true);

  insert into public.intro_requests (id, requester_id, broker_id, target_id, ask, status)
    values ('f0000002-0000-0000-0000-000000000001', a, b, c,
            'Would love to talk about product roles at your company.', 'pending_target');
  -- Accepting the intro opens the group chat (trigger).
  update public.intro_requests set status = 'accepted' where id = 'f0000002-0000-0000-0000-000000000001';
end $$;

select is(
  (select count(*)::int from public.conversation_members cm
   join public.conversations cv on cv.id = cm.conversation_id
   where cv.intro_id = 'f0000002-0000-0000-0000-000000000001'),
  3, 'accepting an intro opens a group chat with requester, broker and target');

select is(
  (select count(*)::int from public.messages m
   join public.conversations cv on cv.id = m.conversation_id
   where cv.intro_id = 'f0000002-0000-0000-0000-000000000001'),
  2, 'the intro chat starts with a system line and the original ask');

-- ===== as A =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('ab', public.start_direct_conversation('f0000001-0000-0000-0000-000000000002'));

select is(public.start_direct_conversation('f0000001-0000-0000-0000-000000000002'), (select v from ids where k = 'ab'),
  'starting a chat with the same person returns the same conversation');

select throws_ok(
  $$ select public.start_direct_conversation('f0000001-0000-0000-0000-000000000004') $$,
  'not_connected', 'cannot DM a stranger');

select lives_ok(
  $$ select public.send_message((select v from ids where k = 'ab'), 'Hey B!') $$,
  'A can send a message in their chat');

-- ===== as B =====
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is((select body from public.conversation_messages((select v from ids where k = 'ab'))), 'Hey B!',
  'B reads the message');
select ok(public.unread_conversation_count() >= 1, 'B has an unread conversation');
select public.mark_conversation_read((select v from ids where k = 'ab'));
select is(
  (select unread_count from public.my_conversations() where id = (select v from ids where k = 'ab')),
  0, 'marking read clears the unread count');

-- ===== as S (stranger) =====
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000004','role','authenticated')::text, true);

select throws_ok(
  $$ select * from public.conversation_messages((select v from ids where k = 'ab')) $$,
  'not_found', 'a non-member cannot read the conversation');
select is((select count(*)::int from public.messages), 0, 'RLS hides every message from a non-member');

reset role;
select ok(not has_function_privilege('anon', 'public.send_message(uuid, text)', 'execute'),
  'anon cannot send messages');

select * from finish();
rollback;
