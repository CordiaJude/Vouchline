create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- ===== fixtures =====
-- A (requester), B (broker, confirmed with A), T1/T2/T3 (confirmed with
-- B, each used for a different intro outcome: T1 accepts, T2's broker
-- leg is declined by B, T3 accepts the broker leg but declines itself).
do $$
declare
  a uuid := 'b0000009-0000-0000-0000-000000000001';
  b uuid := 'b0000009-0000-0000-0000-000000000002';
  t1 uuid := 'b0000009-0000-0000-0000-000000000003';
  t2 uuid := 'b0000009-0000-0000-0000-000000000004';
  t3 uuid := 'b0000009-0000-0000-0000-000000000005';
  uid_ uuid;
begin
  foreach uid_ in array array[a,b,t1,t2,t3]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid_, 'User ' || uid_, true);
  end loop;

  -- A-B confirmed (also exercises the connection-confirmed notification).
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a,b), greatest(a,b), a, 'qr', 2, 2, now(), 2, 2, now());

  -- B confirmed with each target.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values
    (least(b,t1), greatest(b,t1), b, 'qr', 2, 2, now(), 2, 2, now()),
    (least(b,t2), greatest(b,t2), b, 'qr', 2, 2, now(), 2, 2, now()),
    (least(b,t3), greatest(b,t3), b, 'qr', 2, 2, now(), 2, 2, now());
end $$;

-- ===== connection confirmed: both sides notified, exactly once =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'connection_confirmed'),
  1,
  'A gets exactly one connection_confirmed notification for A-B'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications()
     where kind = 'connection_confirmed' and link = '/app/u/b0000009-0000-0000-0000-000000000001'),
  1,
  'B also gets a connection_confirmed notification for the A-B connection specifically'
);

-- ===== request_intro notifies the broker =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

select public.request_intro('b0000009-0000-0000-0000-000000000003'::uuid, 'b0000009-0000-0000-0000-000000000002'::uuid, 'Please introduce me to T1, would love to connect');
select public.request_intro('b0000009-0000-0000-0000-000000000004'::uuid, 'b0000009-0000-0000-0000-000000000002'::uuid, 'Please introduce me to T2, would love to connect');
select public.request_intro('b0000009-0000-0000-0000-000000000005'::uuid, 'b0000009-0000-0000-0000-000000000002'::uuid, 'Please introduce me to T3, would love to connect');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_requested'),
  3,
  'B (the broker) gets an intro_requested notification for each of the three requests'
);

-- T1: broker accepts, target accepts -- requester and broker notified.
select public.respond_intro_broker(
  (select id from public.intro_requests where target_id = 'b0000009-0000-0000-0000-000000000003'::uuid), true, null
);
-- T2: broker declines -- requester notified.
select public.respond_intro_broker(
  (select id from public.intro_requests where target_id = 'b0000009-0000-0000-0000-000000000004'::uuid), false, 'not comfortable'
);
-- T3: broker accepts -- target notified.
select public.respond_intro_broker(
  (select id from public.intro_requests where target_id = 'b0000009-0000-0000-0000-000000000005'::uuid), true, null
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000003','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_forwarded'),
  1,
  'T1 gets an intro_forwarded notification after the broker accepts'
);

select public.respond_intro_target(
  (select id from public.intro_requests where target_id = 'b0000009-0000-0000-0000-000000000003'::uuid), true
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000005','role','authenticated')::text, true);

select public.respond_intro_target(
  (select id from public.intro_requests where target_id = 'b0000009-0000-0000-0000-000000000005'::uuid), false
);

-- ===== requester (A) sees all the resulting notifications =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_accepted'),
  1,
  'A gets intro_accepted once T1 accepts'
);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_declined_broker'),
  1,
  'A gets intro_declined_broker for the T2 request B declined'
);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_declined_target'),
  1,
  'A gets intro_declined_target for the T3 request T3 itself declined'
);

-- ===== broker (B) also gets notified when the T1 intro is accepted =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications() where kind = 'intro_accepted'),
  1,
  'B (the broker) also gets an intro_accepted notification'
);

-- ===== unread count + mark read =====
select is(
  (select public.unread_notification_count()),
  (select count(*)::int from public.my_notifications() where read_at is null),
  'unread_notification_count matches the number of unread rows in my_notifications'
);

select public.mark_notification_read(
  (select id from public.my_notifications() where kind = 'intro_accepted' limit 1)
);

select is(
  (select read_at is not null from public.my_notifications() where kind = 'intro_accepted' limit 1),
  true,
  'mark_notification_read marks that one notification read'
);

select public.mark_all_notifications_read();

select is(
  (select public.unread_notification_count()),
  0,
  'mark_all_notifications_read clears the unread count to zero'
);

-- ===== RLS isolation: a stranger sees none of B's notifications =====
reset role;
do $$
declare
  stranger uuid := 'b0000009-0000-0000-0000-000000000009';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', stranger, 'authenticated', 'authenticated', 'notif_stranger@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (stranger, 'Notif Stranger', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000009-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000009-0000-0000-0000-000000000009','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_notifications()),
  0,
  'a stranger with no notifications of their own sees an empty list, never anyone else''s'
);

select is(
  (select count(*)::int from public.notifications),
  0,
  'direct SELECT on notifications returns nothing -- RLS has no policies, RPC-only'
);

select finish();
rollback;
