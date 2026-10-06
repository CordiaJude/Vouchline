create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

-- ===== anon cannot execute any user-facing RPC =====
-- Regression guard for a real finding: revoking from the PUBLIC
-- pseudo-role alone does not revoke a role's own direct grant. Supabase's
-- platform applies "alter default privileges ... grant execute on
-- functions to anon" for the public schema, so every function created
-- here picks up its own grant to anon unless that's explicitly revoked
-- too (see 0008_security.sql's "grant audit fix"). This must stay 0.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname in (
       'admin_list_members', 'admin_list_reports', 'admin_resolve_report',
       'answer_connection', 'check_and_log_ai_draft', 'check_and_log_login_attempt',
       'connect_token_preview', 'create_connect_token', 'create_sticker_token',
       'decline_connection', 'delete_my_account', 'expire_intros', 'find_brokers',
       'my_connections', 'org_invite_preview', 'pending_for_me', 'redeem_connect_token',
       'redeem_org_invite', 'request_connection', 'request_intro', 'respond_intro_broker',
       'respond_intro_target', 'search_members', 'suggest_from_roster', 'withdraw_intro',
       'log_event', 'report_intro_outcome', 'admin_metric_activation', 'admin_metric_median_edges',
       'admin_metric_path_coverage', 'admin_metric_intro_participation',
       'admin_metric_broker_response_72h', 'admin_metric_completion_rate', 'admin_metric_outcomes',
       'claim_person', 'claim_stub', 'unclaim_connection', 'my_claimed_connections',
       'recompute_my_reach_score', 'dashboard_stats', 'dashboard_reachable_sample', 'my_activity_feed',
       'mutual_connections', 'how_connected', 'discover_search', 'employer_overlap_suggestions',
       'add_target', 'add_target_stub', 'set_target_stage', 'set_target_note', 'remove_target',
       'my_target_list', 'list_companies', 'company_members',
       'my_notifications', 'unread_notification_count', 'mark_notification_read',
       'mark_all_notifications_read'
     )),
  0,
  'anon cannot execute any of this app''s public RPCs'
);

-- ===== structural: no public RPC exposes raw/merged strength =====
select is(
  (select count(*)::int from information_schema.parameters p
     join information_schema.routines r
       on r.specific_name = p.specific_name and r.specific_schema = p.specific_schema
   where r.routine_schema = 'public'
     and p.parameter_mode = 'OUT'
     and p.parameter_name in ('eff_strength', 'lo_strength', 'hi_strength')),
  0,
  'no public RPC returns eff_strength, lo_strength, or hi_strength'
);

-- ===== login rate limit: 5 allowed, 6th blocked =====
do $$
declare i int;
begin
  for i in 1..5 loop
    perform public.check_and_log_login_attempt('rate_limit_login_test@example.com');
  end loop;
end $$;

select throws_like(
  $$ select public.check_and_log_login_attempt('rate_limit_login_test@example.com') $$,
  '%rate_limited%',
  'a 6th login attempt for the same email within 10 minutes is rejected'
);

-- a different email is unaffected by the first email's limit
select lives_ok(
  $$ select public.check_and_log_login_attempt('a_totally_different_email@example.com') $$,
  'the login rate limit is scoped per email, not global'
);

-- ===== search rate limit: 60 allowed, 61st blocked =====
do $$
declare
  org1 uuid;
  searcher uuid := 'd0000001-0000-0000-0000-000000000001';
  i int;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Security Test Chapter', 'security-test-chapter', 'chapter')
  returning id into org1;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', searcher, 'authenticated', 'authenticated', 'searcher@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (searcher, 'Searcher', true);
  insert into public.memberships (org_id, user_id, role, status) values (org1, searcher, 'member', 'active');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

do $$
declare i int;
begin
  for i in 1..60 loop
    perform * from public.search_members('a');
  end loop;
end $$;

select throws_like(
  $$ select * from public.search_members('a') $$,
  '%rate_limited%',
  'a 61st search within a minute is rejected'
);

-- ===== pending_for_me excludes blocked users =====
reset role;
do $$
declare
  org1 uuid;
  a uuid := 'd0000002-0000-0000-0000-000000000001';
  b uuid := 'd0000002-0000-0000-0000-000000000002';
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Block Filter Chapter', 'block-filter-chapter', 'chapter')
  returning id into org1;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'block_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'block_b@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (a, 'Block A', true), (b, 'Block B', true);
  insert into public.memberships (org_id, user_id, role, status) values (org1, a, 'member', 'active'), (org1, b, 'member', 'active');

  -- A initiated and answered; B hasn't answered yet -- shows up in B's
  -- pending_for_me() until B blocks A.
  insert into public.connections (
    user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at
  ) values (
    least(a, b), greatest(a, b), a, 'qr', 2, 2, now()
  );

  insert into public.blocks (blocker_id, blocked_id) values (b, a);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000002-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000002-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.pending_for_me()),
  0,
  'pending_for_me excludes a request from a blocked user'
);

reset role;
select is(
  (select count(*)::int from public.connections
     where least(user_lo,user_hi) = least('d0000002-0000-0000-0000-000000000001'::uuid,'d0000002-0000-0000-0000-000000000002'::uuid)),
  1,
  'the underlying connection row still exists -- blocking hides it, it does not delete it'
);

select * from finish();
rollback;
