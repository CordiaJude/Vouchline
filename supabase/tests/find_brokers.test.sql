create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ===== fixtures (inserted as postgres, bypasses RLS) =====
-- A -- B (broker) -- T (target): A should see B as a broker to T.
-- A -- D directly, D -- T: D would also be a broker, but A blocks D.
-- A -- T directly too, via a second scenario below (separate target E).
-- A claims C (no confirmed connection); C -- T2 confirmed: A should see
-- C as a claimed-kind broker to T2, ranked after any confirmed bridge.
do $$
declare
  org1 uuid;
  user_a uuid := 'aaaaaaa1-0000-0000-0000-000000000001';
  user_b uuid := 'aaaaaaa1-0000-0000-0000-000000000002';
  user_d uuid := 'aaaaaaa1-0000-0000-0000-000000000004';
  user_c uuid := 'aaaaaaa1-0000-0000-0000-000000000006';
  target_t uuid := 'aaaaaaa1-0000-0000-0000-000000000003';
  target_e uuid := 'aaaaaaa1-0000-0000-0000-000000000005';
  target_t2 uuid := 'aaaaaaa1-0000-0000-0000-000000000007';
  conn_ab uuid;
  conn_bt uuid;
  conn_ad uuid;
  conn_dt uuid;
  conn_ae uuid;
  conn_ct2 uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Broker Test Chapter', 'broker-test-chapter', 'chapter')
  returning id into org1;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', user_a, 'authenticated', 'authenticated', 'broker_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_b, 'authenticated', 'authenticated', 'broker_b@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_d, 'authenticated', 'authenticated', 'broker_d@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', user_c, 'authenticated', 'authenticated', 'broker_c@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', target_t, 'authenticated', 'authenticated', 'broker_t@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', target_e, 'authenticated', 'authenticated', 'broker_e@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', target_t2, 'authenticated', 'authenticated', 'broker_t2@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (user_a, 'Broker A', true),
    (user_b, 'Broker B', true),
    (user_d, 'Broker D', true),
    (user_c, 'Broker C', true),
    (target_t, 'Target T', true),
    (target_e, 'Target E', true),
    (target_t2, 'Target T2', true);

  insert into public.memberships (org_id, user_id, role, status) values
    (org1, user_a, 'member', 'active'),
    (org1, user_b, 'member', 'active'),
    (org1, user_d, 'member', 'active'),
    (org1, user_c, 'member', 'active'),
    (org1, target_t, 'member', 'active'),
    (org1, target_e, 'member', 'active'),
    (org1, target_t2, 'member', 'active');

  -- A -- B -- T (valid 2-hop path)
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_a, user_b), greatest(user_a, user_b), user_a, 'qr',
    3, 2, now(), 3, 2, now()
  ) returning id into conn_ab;
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_b, target_t), greatest(user_b, target_t), user_b, 'qr',
    4, 3, now(), 4, 3, now()
  ) returning id into conn_bt;

  -- A -- D -- T (also a valid 2-hop path, but A blocks D)
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_a, user_d), greatest(user_a, user_d), user_a, 'qr',
    1, 1, now(), 1, 1, now()
  ) returning id into conn_ad;
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_d, target_t), greatest(user_d, target_t), user_d, 'qr',
    1, 1, now(), 1, 1, now()
  ) returning id into conn_dt;

  insert into public.blocks (blocker_id, blocked_id) values (user_a, user_d);

  -- A -- E directly (no broker needed / should be excluded).
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_a, target_e), greatest(user_a, target_e), user_a, 'qr',
    2, 2, now(), 2, 2, now()
  ) returning id into conn_ae;

  -- C -- T2 confirmed (A has no confirmed connection to C, only a claim).
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(user_c, target_t2), greatest(user_c, target_t2), user_c, 'qr',
    2, 2, now(), 2, 2, now()
  ) returning id into conn_ct2;

  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_ab, 'lo', 'friend', true), (conn_ab, 'hi', 'friend', true),
    (conn_bt, 'lo', 'mentor', true), (conn_bt, 'hi', 'mentor', true),
    (conn_ad, 'lo', 'coworker', true), (conn_ad, 'hi', 'coworker', true),
    (conn_dt, 'lo', 'coworker', true), (conn_dt, 'hi', 'coworker', true),
    (conn_ae, 'lo', 'friend', true), (conn_ae, 'hi', 'friend', true),
    (conn_ct2, 'lo', 'coworker', true), (conn_ct2, 'hi', 'coworker', true);

  -- The connections rows were already confirmed (both sides answered) by
  -- the time their category rows landed above -- fixtures insert directly
  -- rather than going through private.upsert_connection_answer, which is
  -- what normally guarantees category rows exist before the recompute
  -- trigger's BEFORE UPDATE pass runs. Touch each row once so
  -- recompute_connection (and then sync_edges) re-runs now that the
  -- category data is actually there.
  update public.connections set updated_at = now()
    where id in (conn_ab, conn_bt, conn_ad, conn_dt, conn_ae, conn_ct2);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaa1-0000-0000-0000-000000000001', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'aaaaaaa1-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003'))::int,
  1,
  'exactly one broker returned (D excluded via block)'
);

select is(
  (select broker_name from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003') limit 1),
  'Broker B',
  'the correct broker (B) is returned'
);

select is(
  (select my_rel from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003') limit 1),
  'friend'::public.rel_type,
  'my_rel reflects the caller''s own relationship to the broker'
);

select is(
  (select their_rel from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003') limit 1),
  'mentor'::public.rel_type,
  'their_rel reflects the broker''s relationship to the target'
);

select is(
  (select count(*) from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000005'))::int,
  0,
  'direct connections are excluded (A is already connected to E)'
);

select is(
  (select bridge_kind from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003') limit 1),
  'confirmed',
  'a confirmed 2-hop bridge is reported with bridge_kind = confirmed'
);

-- A claims C (no confirmed connection); C is confirmedly connected to T2.
select public.claim_person('aaaaaaa1-0000-0000-0000-000000000006'::uuid, 'mentor', false, 3, null);

select is(
  (select count(*) from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000007'))::int,
  1,
  'a claimed-only bridge (via C) is surfaced for T2'
);

select is(
  (select bridge_kind from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000007') limit 1),
  'claimed',
  'the claimed bridge is reported with bridge_kind = claimed'
);

-- ===== rate limit: 60/min, keyed per-caller -- reuse A, who already made
-- 8 calls above, so 52 more reaches the cap and the 53rd (61st overall)
-- is rejected =====
do $$
declare i int;
begin
  for i in 1..52 loop
    perform * from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003');
  end loop;
end $$;

select throws_like(
  $$ select * from public.find_brokers('aaaaaaa1-0000-0000-0000-000000000003') $$,
  '%rate_limited%',
  'a 61st find_brokers call within a minute is rejected'
);

select * from finish();
rollback;
