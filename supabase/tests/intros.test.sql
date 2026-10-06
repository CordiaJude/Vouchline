create extension if not exists pgtap with schema extensions;

begin;
select plan(21);

-- ===== fixtures (inserted as postgres, bypasses RLS) =====
do $$
declare
  org1 uuid;
  a1 uuid := 'a0000001-0000-0000-0000-000000000001';
  b1 uuid := 'a0000001-0000-0000-0000-000000000002';
  t1 uuid := 'a0000001-0000-0000-0000-000000000003';
  a2 uuid := 'a0000002-0000-0000-0000-000000000001';
  b2 uuid := 'a0000002-0000-0000-0000-000000000002';
  b2_stranger uuid := 'a0000002-0000-0000-0000-000000000009';
  isolated_target uuid := 'a0000002-0000-0000-0000-00000000000a';
  t2_valid uuid := 'a0000002-0000-0000-0000-00000000000b';
  a3 uuid := 'a0000003-0000-0000-0000-000000000001';
  a4 uuid := 'a0000004-0000-0000-0000-000000000001';
  b4 uuid := 'a0000004-0000-0000-0000-000000000002';
  t4 uuid := 'a0000004-0000-0000-0000-000000000003';
  a5 uuid := 'a0000005-0000-0000-0000-000000000001';
  b5 uuid := 'a0000005-0000-0000-0000-000000000002';
  t5 uuid := 'a0000005-0000-0000-0000-000000000003';
  uid uuid;
  target_ids uuid[];
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Intro Test Chapter', 'intro-test-chapter', 'chapter')
  returning id into org1;

  -- Create every user + profile + membership in one loop.
  foreach uid in array array[a1,b1,t1,a2,b2,b2_stranger,isolated_target,t2_valid,a3,a4,b4,t4,a5,b5,t5]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', uid || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid, 'User ' || uid, true);
    insert into public.memberships (org_id, user_id, role, status) values (org1, uid, 'member', 'active');
  end loop;

  -- Scenario 1: a1 -- b1 -- t1, no direct a1-t1 edge.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a1,b1), greatest(a1,b1), a1, 'qr', 2, 2, now(), 2, 2, now());
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b1,t1), greatest(b1,t1), b1, 'qr', 2, 2, now(), 2, 2, now());

  -- Scenario 2: a2 -- b2 confirmed; b2 not connected to isolated_target;
  -- b2_stranger not connected to a2 at all.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a2,b2), greatest(a2,b2), a2, 'qr', 2, 2, now(), 2, 2, now());

  -- already_directly_connected fixture: connect a2 directly to t1 (reuse).
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a2,t1), greatest(a2,t1), a2, 'qr', 2, 2, now(), 2, 2, now());
  -- and b2 -- t1 so the edge checks pass before hitting the direct-connect check.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b2,t1), greatest(b2,t1), b2, 'qr', 2, 2, now(), 2, 2, now());
  -- b2 -- t2_valid: a real, non-direct-to-a2 target for the
  -- too_many_open_requests test (must pass the edge checks first).
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b2,t2_valid), greatest(b2,t2_valid), b2, 'qr', 2, 2, now(), 2, 2, now());

  -- too_many_open_requests fixture: 3 pre-existing open requests from a2,
  -- each needing its own filler target profile (FK-constrained).
  for i in 1..3 loop
    uid := ('a0000002-1111-1111-1111-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', uid || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid, 'Filler Target ' || uid, true);
    insert into public.memberships (org_id, user_id, role, status) values (org1, uid, 'member', 'active');

    insert into public.intro_requests (requester_id, broker_id, target_id, ask, status)
    values (a2, b2, uid, 'Pre-seeded open request number ' || i || ' asdf', 'pending_broker');
  end loop;

  -- weekly_limit_reached fixture: a3 has 5 withdrawn (non-open) requests
  -- created this week, so open_count is 0 but the weekly count is 5. Broker
  -- and target are filler profiles -- their identity doesn't matter here.
  for i in 1..5 loop
    insert into public.intro_requests (requester_id, broker_id, target_id, ask, status)
    values (a3, a1, b1, 'Pre-seeded weekly request number ' || i || ' asdf', 'withdrawn');
  end loop;

  -- already_requested_this_target fixture: a4 -- b4 -- t4 edges, plus a
  -- declined request to t4 from 10 days ago.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a4,b4), greatest(a4,b4), a4, 'qr', 2, 2, now(), 2, 2, now());
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b4,t4), greatest(b4,t4), b4, 'qr', 2, 2, now(), 2, 2, now());
  insert into public.intro_requests (requester_id, broker_id, target_id, ask, status, created_at)
  values (a4, b4, t4, 'Earlier request to the same target asdf', 'declined_target', now() - interval '10 days');

  -- broker_inbox_full fixture: a5 -- b5 -- t5 edges, plus 5 pending_broker
  -- requests already inbound to b5 from other requesters.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a5,b5), greatest(a5,b5), a5, 'qr', 2, 2, now(), 2, 2, now());
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b5,t5), greatest(b5,t5), b5, 'qr', 2, 2, now(), 2, 2, now());
  for i in 1..5 loop
    uid := ('a0000005-2222-2222-2222-' || lpad(i::text, 12, '0'))::uuid;
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', uid || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid, 'Filler Requester ' || uid, true);
    insert into public.memberships (org_id, user_id, role, status) values (org1, uid, 'member', 'active');

    insert into public.intro_requests (requester_id, broker_id, target_id, ask, status)
    values (uid, b5, t1, 'Pre-seeded inbound request number ' || i || ' asdf', 'pending_broker');
  end loop;
end $$;

-- ===== Scenario 1: happy path + state transitions =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select lives_ok(
  $$ select public.request_intro('a0000001-0000-0000-0000-000000000003'::uuid, 'a0000001-0000-0000-0000-000000000002'::uuid, 'Would love an intro please, thanks so much') $$,
  'happy path: request_intro succeeds'
);

select throws_like(
  $$ select public.respond_intro_broker(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true, null
     ) $$,
  '%not_participant%',
  'non-broker cannot respond as broker'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select lives_ok(
  $$ select public.respond_intro_broker(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true, 'happy to help'
     ) $$,
  'broker accepts'
);

reset role;
select is(
  (select status from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
  'pending_target',
  'status moves to pending_target after broker accepts'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_like(
  $$ select public.respond_intro_target(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true
     ) $$,
  '%not_participant%',
  'non-target cannot respond as target'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select throws_like(
  $$ select public.respond_intro_broker(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true, null
     ) $$,
  '%invalid_state%',
  'broker cannot respond twice'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);

select lives_ok(
  $$ select public.respond_intro_target(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true
     ) $$,
  'target accepts'
);

reset role;
select is(
  (select status from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
  'accepted',
  'status moves to accepted after target accepts'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);

select throws_like(
  $$ select public.respond_intro_target(
       (select id from public.intro_requests where requester_id = 'a0000001-0000-0000-0000-000000000001'::uuid),
       true
     ) $$,
  '%invalid_state%',
  'target cannot respond twice'
);

-- ===== Scenario 2: limits =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000002-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000002-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_like(
  $$ select public.request_intro('a0000001-0000-0000-0000-000000000003'::uuid, 'a0000002-0000-0000-0000-000000000009'::uuid, 'No edge to this broker at all here') $$,
  '%no_edge_requester_broker%',
  'rejects when requester has no edge to broker'
);

select throws_like(
  $$ select public.request_intro('a0000002-0000-0000-0000-00000000000a'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, 'Broker has no edge to this target here') $$,
  '%no_edge_broker_target%',
  'rejects when broker has no edge to target'
);

select throws_like(
  $$ select public.request_intro('a0000001-0000-0000-0000-000000000003'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, 'Already directly connected to target here') $$,
  '%already_directly_connected%',
  'rejects when requester already directly connected to target'
);

select throws_like(
  $$ select public.request_intro('a0000002-0000-0000-0000-00000000000b'::uuid, 'a0000002-0000-0000-0000-000000000002'::uuid, 'Fourth open request should be blocked now') $$,
  '%too_many_open_requests%',
  'rejects a 4th simultaneously-open request'
);

-- a3 needs real edges to a fresh broker/target pair so the weekly-limit
-- check (not the edge check) is what request_intro actually hits.
reset role;
do $$
declare
  a3 uuid := 'a0000003-0000-0000-0000-000000000001';
  b3 uuid := gen_random_uuid();
  t3 uuid := gen_random_uuid();
  org1 uuid;
begin
  select id into org1 from public.orgs where slug = 'intro-test-chapter';

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', b3, 'authenticated', 'authenticated', b3 || '@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', t3, 'authenticated', 'authenticated', t3 || '@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (b3, 'User ' || b3, true), (t3, 'User ' || t3, true);
  insert into public.memberships (org_id, user_id, role, status) values (org1, b3, 'member', 'active'), (org1, t3, 'member', 'active');
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(a3,b3), greatest(a3,b3), a3, 'qr', 2, 2, now(), 2, 2, now());
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(b3,t3), greatest(b3,t3), b3, 'qr', 2, 2, now(), 2, 2, now());

  perform set_config('vouchline_test.a3_broker', b3::text, false);
  perform set_config('vouchline_test.a3_target', t3::text, false);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000003-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000003-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_like(
  format(
    $$ select public.request_intro(%L::uuid, %L::uuid, 'Sixth request this week should now be blocked') $$,
    current_setting('vouchline_test.a3_target'),
    current_setting('vouchline_test.a3_broker')
  ),
  '%weekly_limit_reached%',
  'rejects the 6th request in 7 days once edges are valid'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000004-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000004-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_like(
  $$ select public.request_intro('a0000004-0000-0000-0000-000000000003'::uuid, 'a0000004-0000-0000-0000-000000000002'::uuid, 'Requesting the same target again within 30 days') $$,
  '%already_requested_this_target%',
  'rejects a repeat request to the same target within 30 days'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000005-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000005-0000-0000-0000-000000000001','role','authenticated')::text, true);

select throws_like(
  $$ select public.request_intro('a0000005-0000-0000-0000-000000000003'::uuid, 'a0000005-0000-0000-0000-000000000002'::uuid, 'Broker already has five pending requests inbound') $$,
  '%broker_inbox_full%',
  'rejects when the broker already has 5 pending inbound requests'
);

-- ===== withdraw_intro =====
reset role;
do $$
declare
  requester uuid := 'a0000006-0000-0000-0000-000000000001';
  other uuid := 'a0000006-0000-0000-0000-000000000002';
  org1 uuid;
begin
  select id into org1 from public.orgs where slug = 'intro-test-chapter';

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', requester, 'authenticated', 'authenticated', requester || '@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', other, 'authenticated', 'authenticated', other || '@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (requester, 'User ' || requester, true), (other, 'User ' || other, true);
  insert into public.memberships (org_id, user_id, role, status) values (org1, requester, 'member', 'active'), (org1, other, 'member', 'active');
  insert into public.intro_requests (id, requester_id, broker_id, target_id, ask, status)
  values ('60000000-0000-0000-0000-000000000000', requester, other, 'a0000001-0000-0000-0000-000000000003'::uuid, 'A request to withdraw asdfasdf', 'pending_broker');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000006-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000006-0000-0000-0000-000000000002','role','authenticated')::text, true);

select throws_like(
  $$ select public.withdraw_intro('60000000-0000-0000-0000-000000000000'::uuid) $$,
  '%not_participant%',
  'withdraw_intro rejects a non-requester'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000006-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000006-0000-0000-0000-000000000001','role','authenticated')::text, true);

select lives_ok(
  $$ select public.withdraw_intro('60000000-0000-0000-0000-000000000000'::uuid) $$,
  'requester can withdraw a pending request'
);

select throws_like(
  $$ select public.withdraw_intro('60000000-0000-0000-0000-000000000000'::uuid) $$,
  '%invalid_state%',
  'withdraw_intro rejects an already-withdrawn request'
);

-- ===== expire_intros =====
reset role;
insert into public.intro_requests (requester_id, broker_id, target_id, ask, status, expires_at)
values (
  'a0000006-0000-0000-0000-000000000001', 'a0000006-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000003'::uuid,
  'An expired request asdfasdf', 'pending_broker', now() - interval '1 hour'
);

select public.expire_intros();

select is(
  (select status from public.intro_requests
     where requester_id = 'a0000006-0000-0000-0000-000000000001'::uuid and status = 'expired'),
  'expired',
  'expire_intros marks past-due pending requests as expired'
);

-- ===== claimed bridge: requester has only claimed the broker, no
-- confirmed connection -- request_intro must still succeed (0016), since
-- find_brokers now surfaces claimed bridges too. Fresh trio so it can't
-- collide with a2's open-request-count fixtures above.
reset role;
do $$
declare
  requester uuid := 'a0000007-0000-0000-0000-000000000001';
  broker uuid := 'a0000007-0000-0000-0000-000000000002';
  target uuid := 'a0000007-0000-0000-0000-000000000003';
  org1 uuid;
  uid uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Claimed Bridge Chapter', 'claimed-bridge-chapter', 'chapter')
  returning id into org1;

  foreach uid in array array[requester, broker, target]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', uid || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid, 'User ' || uid, true);
    insert into public.memberships (org_id, user_id, role, status) values (org1, uid, 'member', 'active');
  end loop;

  -- broker -- target confirmed; requester -- broker is a claim only.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
  values (least(broker,target), greatest(broker,target), broker, 'qr', 2, 2, now(), 2, 2, now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000007-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','a0000007-0000-0000-0000-000000000001','role','authenticated')::text, true);

select public.claim_person('a0000007-0000-0000-0000-000000000002'::uuid, 'mentor', false, 3, null);

select lives_ok(
  $$ select public.request_intro('a0000007-0000-0000-0000-000000000003'::uuid, 'a0000007-0000-0000-0000-000000000002'::uuid, 'Using a claimed bridge, no confirmed edge to the broker') $$,
  'request_intro succeeds through a claimed-only bridge to the broker'
);

select * from finish();
rollback;
