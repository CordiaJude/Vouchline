create extension if not exists pgtap with schema extensions;

begin;
select plan(13);

-- ===== fixtures =====
-- A-B confirmed (friend), A-F confirmed, B-F confirmed (F is mutual to
-- A and B). A has claimed C (no confirmed connection). A has a pending
-- (unanswered-by-D) request out to D. E has no relationship to A at
-- all. A stranger S shares no org with A.
do $$
declare
  a uuid := 'e0000002-0000-0000-0000-000000000001';
  b uuid := 'e0000002-0000-0000-0000-000000000002';
  c uuid := 'e0000002-0000-0000-0000-000000000003';
  d uuid := 'e0000002-0000-0000-0000-000000000004';
  f uuid := 'e0000002-0000-0000-0000-000000000005';
  s uuid := 'e0000002-0000-0000-0000-000000000006';
  e_ uuid := 'e0000002-0000-0000-0000-000000000007';
  uid_ uuid;
  conn_ab uuid;
  conn_af uuid;
  conn_bf uuid;
begin
  foreach uid_ in array array[a,b,c,d,f,s,e_]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid_, 'User ' || uid_, true);
  end loop;

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(a,b), greatest(a,b), a, 'qr', 3, 2, now(), 3, 2, now())
    returning id into conn_ab;
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(a,f), greatest(a,f), a, 'qr', 1, 1, now(), 1, 1, now())
    returning id into conn_af;
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(b,f), greatest(b,f), b, 'qr', 1, 1, now(), 1, 1, now())
    returning id into conn_bf;

  -- A -> D: pending, A has answered (lo side, since a < d), D has not.
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(a,d), greatest(a,d), a, 'qr', 2, 2, now(), null, null, null);

  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_ab, 'lo', 'friend', true), (conn_ab, 'hi', 'friend', true),
    (conn_af, 'lo', 'friend', true), (conn_af, 'hi', 'friend', true),
    (conn_bf, 'lo', 'friend', true), (conn_bf, 'hi', 'friend', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000002-0000-0000-0000-000000000001','role','authenticated')::text, true);

select public.claim_person('e0000002-0000-0000-0000-000000000003'::uuid, 'mentor', false, 5, 'Great mentor');

-- ===== how_connected: confirmed relationship, with mutual count =====
select is(
  (select kind from public.how_connected('e0000002-0000-0000-0000-000000000002'::uuid)),
  'confirmed',
  'how_connected reports a confirmed relationship with B'
);

select is(
  (select relationship_status from public.how_connected('e0000002-0000-0000-0000-000000000002'::uuid)),
  'confirmed',
  'how_connected reports relationship_status confirmed for B'
);

select is(
  (select categories->0->>'category' from public.how_connected('e0000002-0000-0000-0000-000000000002'::uuid)),
  'friend',
  'how_connected reports A''s own category for B (friend)'
);

select is(
  (select mutual_count from public.how_connected('e0000002-0000-0000-0000-000000000002'::uuid)),
  1,
  'how_connected reports exactly 1 mutual connection (F)'
);

-- ===== mutual_connections: the actual list matches =====
select is(
  (select array_agg(id) from public.mutual_connections('e0000002-0000-0000-0000-000000000002'::uuid)),
  array['e0000002-0000-0000-0000-000000000005'::uuid],
  'mutual_connections between A and B returns exactly F'
);

-- ===== how_connected: falls back to a claim when there''s no confirmed edge =====
select is(
  (select kind from public.how_connected('e0000002-0000-0000-0000-000000000003'::uuid)),
  'claimed',
  'how_connected falls back to a claimed relationship with C'
);

select is(
  (select relationship_status from public.how_connected('e0000002-0000-0000-0000-000000000003'::uuid)),
  'claimed',
  'how_connected reports relationship_status claimed for C'
);

-- ===== how_connected: neither confirmed nor claimed nor pending =====
select is(
  (select kind from public.how_connected('e0000002-0000-0000-0000-000000000007'::uuid)),
  null,
  'how_connected reports no relationship with E'
);

select is(
  (select relationship_status from public.how_connected('e0000002-0000-0000-0000-000000000007'::uuid)),
  'none',
  'how_connected reports relationship_status none for E'
);

-- ===== how_connected: a pending request A sent to D shows as pending_sent
-- from A''s side =====
select is(
  (select relationship_status from public.how_connected('e0000002-0000-0000-0000-000000000004'::uuid)),
  'pending_sent',
  'how_connected reports pending_sent for A''s unanswered request to D'
);

reset role;

-- The same pending request, seen from D''s side, is pending_received --
-- this is the case that used to be indistinguishable from "no
-- relationship at all" and left the profile page with no way to surface
-- a Respond action.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000002-0000-0000-0000-000000000004','role','authenticated')::text, true);

select is(
  (select relationship_status from public.how_connected('e0000002-0000-0000-0000-000000000001'::uuid)),
  'pending_received',
  'how_connected reports pending_received for D''s view of A''s request'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000002-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- ===== cross-user profile access respects RLS =====
-- S shares no org and has no relationship with A; a stranger reading A's
-- profile directly (bypassing any RPC) must see nothing via the
-- profiles_select policy (id = auth.uid() OR shares_org).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000002-0000-0000-0000-000000000006','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.profiles where id = 'e0000002-0000-0000-0000-000000000001'::uuid),
  0,
  'a stranger sharing no org cannot see A''s profile directly (RLS)'
);

reset role;

-- F and A share no org at all in this fixture, but they ARE confirmedly
-- connected -- Phase 2 removed the org gate on connecting, so profile
-- visibility can't still require a shared org or this connection would
-- be functionally useless.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000002-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000002-0000-0000-0000-000000000005','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.profiles where id = 'e0000002-0000-0000-0000-000000000001'::uuid),
  1,
  'F can see A''s profile via their confirmed connection, despite sharing no org'
);

reset role;
select * from finish();
rollback;
