create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

-- ===== fixtures (inserted as postgres, bypasses RLS) =====
do $$
declare
  org1 uuid;
  org2 uuid;
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
  user_c uuid := '33333333-3333-3333-3333-333333333333';
  conn_id uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Test Chapter', 'test-chapter', 'chapter')
  returning id into org1;

  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Other Chapter', 'other-chapter', 'chapter')
  returning id into org2;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated', 'a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated', 'b@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_c, 'authenticated', 'authenticated', 'c@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (user_a, 'User A', true),
    (user_b, 'User B', true),
    (user_c, 'User C', true);

  -- A and B share org1; C is only in org2 (no shared org with A).
  insert into public.memberships (org_id, user_id, role, status) values
    (org1, user_a, 'member', 'active'),
    (org1, user_b, 'member', 'active'),
    (org2, user_c, 'member', 'active');

  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_a, user_b), greatest(user_a, user_b), user_a, 'qr',
    3, 2, now(), 3, 2, now()
  ) returning id into conn_id;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_id, 'lo', 'friend', true),
    (conn_id, 'hi', 'friend', true);
end $$;

-- ===== act as user A (authenticated) =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.connections)::int, 0,
  'authenticated user cannot select from connections directly'
);

select is(
  (select count(*) from public.connection_edges)::int, 0,
  'authenticated user cannot select from connection_edges directly'
);

select is(
  (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333')::int, 0,
  'cannot see a profile outside shared orgs'
);

select is(
  (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111')::int, 1,
  'can see own profile'
);

select throws_like(
  $$ insert into public.intro_requests (requester_id, broker_id, target_id, ask)
     values (
       '11111111-1111-1111-1111-111111111111',
       '22222222-2222-2222-2222-222222222222',
       '33333333-3333-3333-3333-333333333333',
       'Would love an introduction please'
     ) $$,
  '%row-level security%',
  'cannot insert intro_requests directly'
);

-- ===== act as anon =====
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*) from public.profiles)::int, 0,
  'anon sees no profiles'
);

select is(
  (select count(*) from public.orgs)::int, 0,
  'anon sees no orgs'
);

select is(
  (select count(*) from public.connections)::int, 0,
  'anon sees no connections'
);

select * from finish();
rollback;
