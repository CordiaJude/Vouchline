create extension if not exists pgtap with schema extensions;

begin;
select plan(19);

-- ===== fixtures =====
-- Fixed, hand-computable numbers: 5 org members (1 admin, 2 students with
-- distinct grad years, 2 alumni), 1 confirmed connection (so exactly 2 of
-- the 5 have >=1 edge), 2 find_brokers_run events (1 covered, 1 not), and
-- 2 intro_requests (1 accepted+reported, 1 declined by a broker who
-- responded outside the 72h window). The org is looked up by slug below
-- rather than threaded through a variable, since it's generated inside
-- this do block.
do $$
declare
  org2 uuid;
  admin_id uuid := 'e0000001-0000-0000-0000-000000000001';
  s1 uuid := 'e0000001-0000-0000-0000-000000000002'; -- grad_year 2027, student
  s2 uuid := 'e0000001-0000-0000-0000-000000000003'; -- grad_year 2026, student
  al1 uuid := 'e0000001-0000-0000-0000-000000000004'; -- grad_year 2020, alumni
  al2 uuid := 'e0000001-0000-0000-0000-000000000005'; -- grad_year 2019, alumni
  uid uuid;
  conn_s1s2 uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Metrics Test Chapter', 'metrics-test-chapter', 'chapter')
  returning id into org2;

  foreach uid in array array[admin_id,s1,s2,al1,al2]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', uid || '@example.com', '{}', '{}', now(), now());
  end loop;

  insert into public.profiles (id, full_name, is_18_plus, grad_year) values
    (admin_id, 'Admin', true, null),
    (s1, 'Student One', true, 2027),
    (s2, 'Student Two', true, 2026),
    (al1, 'Alumni One', true, 2020),
    (al2, 'Alumni Two', true, 2019);

  insert into public.memberships (org_id, user_id, role, status) values
    (org2, admin_id, 'admin', 'active'),
    (org2, s1, 'member', 'active'),
    (org2, s2, 'member', 'active'),
    (org2, al1, 'member', 'active'),
    (org2, al2, 'member', 'active');

  -- One confirmed edge: s1 <-> s2. Everyone else has zero edges.
  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(s1,s2), greatest(s1,s2), s1, 'qr',
    1, 2, now(), 1, 2, now()
  ) returning id into conn_s1s2;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_s1s2, 'lo', 'friend', true), (conn_s1s2, 'hi', 'friend', true);

  -- find_brokers_run events: 1 covered (broker_count >= 1), 1 not.
  insert into public.events (user_id, org_id, name, props) values
    (s1, org2, 'find_brokers_run', jsonb_build_object('broker_count', 1)),
    (s2, org2, 'find_brokers_run', jsonb_build_object('broker_count', 0));

  -- intro 1: s1 -> al1 via s2, accepted, broker responded within 72h,
  -- outcome already reported as "talked".
  insert into public.intro_requests (
    requester_id, broker_id, target_id, ask, status,
    created_at, broker_responded_at, target_responded_at,
    outcome_reported_at, outcome_talked
  ) values (
    s1, s2, al1, 'Would love an introduction, thanks!', 'accepted',
    now() - interval '10 days', now() - interval '10 days' + interval '1 hour',
    now() - interval '10 days' + interval '2 hours', now(), true
  );

  -- intro 2: al1 -> s2 via s1, declined by the broker after 4 days
  -- (outside the 72h window).
  insert into public.intro_requests (
    requester_id, broker_id, target_id, ask, status,
    created_at, broker_responded_at
  ) values (
    al1, s1, s2, 'Would love an introduction, thanks a lot!', 'declined_broker',
    now() - interval '10 days', now() - interval '10 days' + interval '4 days'
  );
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- activation: 2 of 5 members (s1, s2) have >=1 confirmed edge.
select is(
  (select sum(activated_count)::int from public.admin_metric_activation(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  2,
  'activation: 2 of 5 members have a confirmed edge'
);
select is(
  (select sum(member_count)::int from public.admin_metric_activation(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  5,
  'activation: grad_year groups sum to all 5 members'
);

-- median confirmed edges per active user: edge counts [0,0,0,1,1] -> median 0.
select is(
  (select public.admin_metric_median_edges(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  0::numeric,
  'median confirmed edges per active user is 0 (3 of 5 users have none)'
);

-- path coverage: 1 of 2 find_brokers_run events found a broker.
select is(
  (select public.admin_metric_path_coverage(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  50.0::numeric,
  'path coverage is 50% (1 of 2 searches found a broker)'
);

-- intro participation by cohort: student (admin, s1, s2) has 1 requester
-- (s1); alumni (al1, al2) has 1 requester (al1).
select is(
  (select with_request_count from public.admin_metric_intro_participation(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  ) where cohort = 'student'),
  1,
  'student cohort: 1 of 3 members (s1) sent an intro request'
);
select is(
  (select member_count from public.admin_metric_intro_participation(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  ) where cohort = 'student'),
  3,
  'student cohort has 3 members (admin, s1, s2)'
);
select is(
  (select with_request_count from public.admin_metric_intro_participation(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  ) where cohort = 'alumni'),
  1,
  'alumni cohort: 1 of 2 members (al1) sent an intro request'
);

-- broker response within 72h: 1 of 2 responded brokers were within 72h.
select is(
  (select public.admin_metric_broker_response_72h(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  50.0::numeric,
  'broker response within 72h is 50% (1 of 2 responses)'
);

-- completion rate: 1 accepted of 2 non-withdrawn requests.
select is(
  (select public.admin_metric_completion_rate(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  50.0::numeric,
  'completion rate is 50% (1 accepted of 2 requests)'
);

-- outcomes: the one accepted intro was reported as "talked".
select is(
  (select talked from public.admin_metric_outcomes(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  1,
  'outcomes: 1 accepted intro reported as talked'
);
select is(
  (select no_response from public.admin_metric_outcomes(
    (select id from public.orgs where slug = 'metrics-test-chapter')
  )),
  0,
  'outcomes: no accepted intro is still awaiting a report'
);

-- a non-admin gets not_authorized, not real numbers.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);
select throws_like(
  $$ select * from public.admin_metric_activation((select id from public.orgs where slug = 'metrics-test-chapter')) $$,
  '%not_authorized%',
  'a non-admin member cannot call an admin metric function'
);

-- ===== log_event =====
select throws_like(
  $$ select public.log_event('not_a_real_event', '{}'::jsonb) $$,
  '%invalid_event_name%',
  'log_event rejects a name outside the whitelist'
);
select lives_ok(
  $$ select public.log_event('onboarded', '{}'::jsonb) $$,
  'log_event accepts a whitelisted name'
);

-- ===== log_event: find_brokers_run props are validated, not passed
-- through raw -- a direct PostgREST caller can't poison
-- admin_metric_path_coverage with a non-numeric broker_count =====
select throws_like(
  $$ select public.log_event('find_brokers_run', '{}'::jsonb) $$,
  '%invalid_event_props%',
  'log_event rejects find_brokers_run with no broker_count'
);
select throws_like(
  $$ select public.log_event('find_brokers_run', jsonb_build_object('broker_count', 'not_a_number')) $$,
  '%invalid_event_props%',
  'log_event rejects find_brokers_run with a non-numeric broker_count'
);
select lives_ok(
  $$ select public.log_event('find_brokers_run', jsonb_build_object('broker_count', 2)) $$,
  'log_event accepts find_brokers_run with a numeric broker_count'
);

-- admin_metric_path_coverage stays cast-safe even against a row that
-- bypassed log_event entirely (inserted directly, as postgres would for
-- a pre-existing bad row, or as any other trusted server-side path).
-- events has no RLS policies at all (RPC-only), so this insert has to
-- run as postgres, not the "authenticated" role the tests above set.
reset role;
insert into public.events (user_id, org_id, name, props) values (
  'e0000001-0000-0000-0000-000000000002',
  (select id from public.orgs where slug = 'metrics-test-chapter'),
  'find_brokers_run', jsonb_build_object('broker_count', 'garbage')
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select lives_ok(
  $$ select public.admin_metric_path_coverage((select id from public.orgs where slug = 'metrics-test-chapter')) $$,
  'admin_metric_path_coverage does not throw on a malformed broker_count row'
);

-- ===== report_intro_outcome =====
-- reuse intro 1 (s1 -> al1 via s2, accepted) but it already has an
-- outcome reported in the fixture, so this exercises "already_reported".
-- Called as al1, the intro's target (a valid participant) -- s2 is only
-- the broker and isn't allowed to report at all.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000004','role','authenticated')::text, true);
select throws_like(
  $$ select public.report_intro_outcome(
       (select id from public.intro_requests where target_id = 'e0000001-0000-0000-0000-000000000004'::uuid and status = 'accepted'),
       false
     ) $$,
  '%already_reported%',
  'report_intro_outcome rejects a second report on the same intro'
);

select * from finish();
rollback;
