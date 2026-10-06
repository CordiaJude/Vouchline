create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ===== fixtures (inserted as postgres, bypasses RLS) =====
do $$
declare
  org1 uuid;
  org2 uuid;
  user_a uuid := 'a1111111-1111-1111-1111-111111111111';
  user_b uuid := 'b2222222-2222-2222-2222-222222222222';
  user_c uuid := 'c3333333-3333-3333-3333-333333333333';
  tok text;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Connect Test Chapter', 'connect-test-chapter', 'chapter')
  returning id into org1;

  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Connect Test Other Org', 'connect-test-other-org', 'chapter')
  returning id into org2;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated', 'conn_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated', 'conn_b@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_c, 'authenticated', 'authenticated', 'conn_c@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (user_a, 'Connect A', true),
    (user_b, 'Connect B', true),
    (user_c, 'Connect C', true);

  -- A and B share org1; C is only in org2 (no shared org with A or B).
  insert into public.memberships (org_id, user_id, role, status) values
    (org1, user_a, 'member', 'active'),
    (org1, user_b, 'member', 'active'),
    (org2, user_c, 'member', 'active');
end $$;

-- ===== self-connect rejected =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_like(
  $$ select public.request_connection(
       'a1111111-1111-1111-1111-111111111111'::uuid,
       '[{"category":"friend","is_primary":true}]'::jsonb, 3, 2
     ) $$,
  '%cannot_connect_self%',
  'self-connect is rejected'
);

-- ===== no org gate: C shares no org with A, connect still works =====
select lives_ok(
  $$ select public.request_connection(
       'c3333333-3333-3333-3333-333333333333'::uuid,
       '[{"category":"friend","is_primary":true}]'::jsonb, 3, 2
     ) $$,
  'connecting to someone who shares no org works -- there is no org gate on who can connect'
);

-- ===== lower-user_id-wins tiebreak on a primary mismatch =====
-- A answers "mentor" (primary), 5 years, strength 3.
select lives_ok(
  $$ select public.request_connection(
       'b2222222-2222-2222-2222-222222222222'::uuid,
       '[{"category":"mentor","is_primary":true}]'::jsonb, 5, 3
     ) $$,
  'A can request a connection to B'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-2222-2222-2222-222222222222', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);

-- B answers "coworker" (primary, mismatches A's "mentor"), 2 years,
-- strength 1 -- both lower than A's. connections has no SELECT policy
-- (RPC-only), so fetch the id B is supposed to answer via
-- pending_for_me(), not a direct table query.
select lives_ok(
  $$ select public.answer_connection(
       (select connection_id from public.pending_for_me() limit 1),
       '[{"category":"coworker","is_primary":true}]'::jsonb, 2, 1
     ) $$,
  'B can answer the pending connection'
);

reset role;

select is(
  (select status from public.connections
     where user_lo = 'a1111111-1111-1111-1111-111111111111'::uuid and user_hi = 'b2222222-2222-2222-2222-222222222222'::uuid),
  'confirmed',
  'connection auto-confirms once both sides answer'
);

select is(
  (select eff_type from public.connections
     where user_lo = 'a1111111-1111-1111-1111-111111111111'::uuid and user_hi = 'b2222222-2222-2222-2222-222222222222'::uuid),
  'mentor'::public.rel_type,
  'on a primary mismatch, eff_type deterministically follows the lower user_id (A''s "mentor", not B''s "coworker")'
);

select is(
  (select eff_years from public.connections
     where user_lo = 'a1111111-1111-1111-1111-111111111111'::uuid and user_hi = 'b2222222-2222-2222-2222-222222222222'::uuid),
  2::smallint,
  'eff_years is the lower of the two (5 vs 2 -> 2)'
);

select is(
  (select eff_strength from public.connections
     where user_lo = 'a1111111-1111-1111-1111-111111111111'::uuid and user_hi = 'b2222222-2222-2222-2222-222222222222'::uuid),
  1::smallint,
  'eff_strength is the lower of the two (3 vs 1 -> 1)'
);

-- ===== rate limit triggers =====
-- Pre-seed 30 connections "initiated" by A in the last 24h (bypassing RLS
-- as postgres) so the next request_connection call is over the limit.
do $$
declare
  i int;
  filler uuid;
  target uuid;
  org1 uuid;
begin
  select id into org1 from public.orgs where slug = 'connect-test-chapter';

  for i in 1..30 loop
    filler := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', filler, 'authenticated', 'authenticated', 'filler_' || i || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (filler, 'Filler ' || i, true);
    insert into public.memberships (org_id, user_id, role, status) values (org1, filler, 'member', 'active');
    insert into public.connections (
      user_lo, user_hi, initiated_by, source, lo_answered_at
    ) values (
      least('a1111111-1111-1111-1111-111111111111'::uuid, filler),
      greatest('a1111111-1111-1111-1111-111111111111'::uuid, filler),
      'a1111111-1111-1111-1111-111111111111'::uuid,
      'qr',
      now()
    );
  end loop;

  -- A same-org target A hasn't connected to yet, so the rate-limit check
  -- (not shares_org/already_answered) is what fires next.
  target := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', target, 'authenticated', 'authenticated', 'rate_limit_target@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (target, 'Rate Limit Target', true);
  insert into public.memberships (org_id, user_id, role, status) values (org1, target, 'member', 'active');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select throws_like(
  $$ select public.request_connection(
       (select id from public.profiles where full_name = 'Rate Limit Target'),
       '[{"category":"friend","is_primary":true}]'::jsonb, 1, 1
     ) $$,
  '%rate_limited%',
  'more than 30 connections initiated in 24h is rate limited'
);

select * from finish();
rollback;
