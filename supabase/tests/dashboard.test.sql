create extension if not exists pgtap with schema extensions;

begin;
select plan(8);

-- ===== reach score fixture =====
-- Chain: M-A, M-B, A-C, B-D, C-E (confirmed). 2-hop reach from M is
-- {A, B, C, D} = 4 people; E is 3 hops away and must not count.
do $$
declare
  m uuid := 'd0000001-0000-0000-0000-000000000001';
  a uuid := 'd0000001-0000-0000-0000-000000000002';
  b uuid := 'd0000001-0000-0000-0000-000000000003';
  c uuid := 'd0000001-0000-0000-0000-000000000004';
  d uuid := 'd0000001-0000-0000-0000-000000000005';
  e uuid := 'd0000001-0000-0000-0000-000000000006';
  org1 uuid;
  uid_ uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Dashboard Test Chapter', 'dashboard-test-chapter', 'chapter')
  returning id into org1;

  foreach uid_ in array array[m,a,b,c,d,e]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid_, 'User ' || uid_, true);
  end loop;

  insert into public.memberships (org_id, user_id, role, status) values (org1, m, 'member', 'active');

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at) values
    (least(m,a), greatest(m,a), m, 'qr', 2, 2, now(), 2, 2, now()),
    (least(m,b), greatest(m,b), m, 'qr', 2, 2, now(), 2, 2, now()),
    (least(a,c), greatest(a,c), a, 'qr', 2, 2, now(), 2, 2, now()),
    (least(b,d), greatest(b,d), b, 'qr', 2, 2, now(), 2, 2, now()),
    (least(c,e), greatest(c,e), c, 'qr', 2, 2, now(), 2, 2, now());

  insert into public.connection_categories (connection_id, side, category, is_primary)
  select conn.id, s.side, 'friend', true
  from public.connections conn
  cross join (values ('lo'), ('hi')) as s(side)
  where (conn.user_lo, conn.user_hi) in (
    (least(m,a), greatest(m,a)), (least(m,b), greatest(m,b)), (least(a,c), greatest(a,c)),
    (least(b,d), greatest(b,d)), (least(c,e), greatest(c,e))
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select public.recompute_my_reach_score()),
  4,
  'reach score is 4 (A, B, C, D) -- E is 3 hops away and excluded'
);

reset role;
select is(
  (select reach_score from public.profiles where id = 'd0000001-0000-0000-0000-000000000001'::uuid),
  4,
  'reach_score is cached onto the profile row'
);
select ok(
  (select reach_score_updated_at from public.profiles where id = 'd0000001-0000-0000-0000-000000000001'::uuid) is not null,
  'reach_score_updated_at is stamped'
);

-- blocking C removes it from the reachable set
insert into public.blocks (blocker_id, blocked_id)
values ('d0000001-0000-0000-0000-000000000001'::uuid, 'd0000001-0000-0000-0000-000000000004'::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select public.recompute_my_reach_score()),
  3,
  'blocking C drops reach score to 3 (A, B, D)'
);

-- dashboard_reachable_sample only considers 2-hop bridges (C and D), not
-- M's own direct connections (A, B); C is blocked, so only D remains.
select is(
  (select array_agg(id order by id) from public.dashboard_reachable_sample()),
  array['d0000001-0000-0000-0000-000000000005'::uuid],
  'reachable-sample surfaces only D -- the 2-hop bridge C is blocked'
);

-- ===== dashboard_stats =====
select is(
  (select connections_count from public.dashboard_stats()),
  2,
  'dashboard_stats connections_count is 2 -- M''s own direct confirmed edges (A, B), not the wider reachable set'
);

select is(
  (select orgs_count from public.dashboard_stats()),
  1,
  'dashboard_stats orgs_count is 1'
);

reset role;

-- pending confirmation: F connects to M via QR, M hasn't answered yet.
do $$
declare
  m uuid := 'd0000001-0000-0000-0000-000000000001';
  f uuid := 'd0000001-0000-0000-0000-000000000007';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', f, 'authenticated', 'authenticated', 'd7f@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (f, 'User F', true);
  -- m < f, so m is user_lo and f is user_hi -- F's answer (the initiator)
  -- goes in the hi_ slot, leaving lo_ (M's slot) unanswered.
  insert into public.connections (user_lo, user_hi, initiated_by, source, hi_years, hi_strength, hi_answered_at)
  values (least(m,f), greatest(m,f), f, 'qr', 1, 1, now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select pending_confirmations_count from public.dashboard_stats()),
  1,
  'dashboard_stats pending_confirmations_count is 1'
);

reset role;
select * from finish();
rollback;
