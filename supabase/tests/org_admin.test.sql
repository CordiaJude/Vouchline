create extension if not exists pgtap with schema extensions;

begin;
select plan(16);

-- ===== fixtures (inserted as postgres, bypasses RLS) =====
do $$
declare
  org1 uuid;
  admin_user uuid := 'b0000001-0000-0000-0000-000000000001';
  member_user uuid := 'b0000001-0000-0000-0000-000000000002';
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Admin Test Chapter', 'admin-test-chapter', 'chapter')
  returning id into org1;
  perform set_config('vouchline_test.org1', org1::text, false);

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', admin_user, 'authenticated', 'authenticated', 'org_admin@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', member_user, 'authenticated', 'authenticated', 'org_member@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values
    (admin_user, 'Org Admin', true),
    (member_user, 'Org Member', true);
  insert into public.memberships (org_id, user_id, role, status) values
    (org1, admin_user, 'admin', 'active'),
    (org1, member_user, 'member', 'active');

  insert into public.org_invites (token, org_id, created_by, email, max_uses, uses, expires_at) values
    ('tok-single-use-0001', org1, admin_user, null, 1, 0, now() + interval '14 days'),
    ('tok-multi-use-00001', org1, admin_user, null, 2, 0, now() + interval '14 days'),
    ('tok-expired-0000001', org1, admin_user, null, 5, 0, now() - interval '1 day'),
    ('tok-email-bound-001', org1, admin_user, 'onlyme@example.com', 1, 0, now() + interval '14 days');

  insert into public.reports (id, reporter_id, reported_id, reason, status)
  values
    ('c0000001-0000-0000-0000-000000000001', admin_user, member_user, 'Test report to dismiss asdf', 'open'),
    ('c0000001-0000-0000-0000-000000000002', admin_user, member_user, 'Test report to action asdf', 'open');
end $$;

-- ===== admin vs non-admin =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select throws_like(
  format($$ select public.admin_list_members(%L::uuid) $$, current_setting('vouchline_test.org1')),
  '%not_authorized%',
  'non-admin cannot list members'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.admin_list_members((current_setting('vouchline_test.org1'))::uuid)),
  2,
  'admin can list members and sees both fixture members'
);

-- ===== profile_required =====
reset role;
do $$
declare c uuid := 'b0000002-0000-0000-0000-000000000003';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', c, 'authenticated', 'authenticated', 'no_profile_yet@example.com', '{}', '{}', now(), now());
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000003','role','authenticated')::text, true);

select throws_like(
  $$ select public.redeem_org_invite('tok-single-use-0001') $$,
  '%profile_required%',
  'redeeming before a profile exists is rejected'
);

-- ===== single-use invite: happy path then exhausted =====
reset role;
insert into public.profiles (id, full_name, is_18_plus)
values ('b0000002-0000-0000-0000-000000000003', 'No Profile Yet', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000003','role','authenticated')::text, true);

select lives_ok(
  $$ select public.redeem_org_invite('tok-single-use-0001') $$,
  'redeeming a valid single-use invite succeeds'
);

reset role;
select is(
  (select status from public.memberships
     where org_id = (current_setting('vouchline_test.org1'))::uuid
       and user_id = 'b0000002-0000-0000-0000-000000000003'::uuid),
  'active',
  'redemption creates an active membership'
);

do $$
declare d uuid := 'b0000002-0000-0000-0000-000000000004';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', d, 'authenticated', 'authenticated', 'second_redeemer@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (d, 'Second Redeemer', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000004','role','authenticated')::text, true);

select throws_like(
  $$ select public.redeem_org_invite('tok-single-use-0001') $$,
  '%invite_exhausted%',
  'a single-use invite is rejected once already used'
);

-- ===== multi-use invite: exactly max_uses succeed, one more fails =====
reset role;
do $$
declare h uuid := 'b0000002-0000-0000-0000-000000000005'; i uuid := 'b0000002-0000-0000-0000-000000000006'; j uuid := 'b0000002-0000-0000-0000-000000000007';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', h, 'authenticated', 'authenticated', 'multi_h@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', i, 'authenticated', 'authenticated', 'multi_i@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', j, 'authenticated', 'authenticated', 'multi_j@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values
    (h, 'Multi H', true), (i, 'Multi I', true), (j, 'Multi J', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000005','role','authenticated')::text, true);
select lives_ok(
  $$ select public.redeem_org_invite('tok-multi-use-00001') $$,
  'multi-use invite: 1st redemption succeeds'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000006','role','authenticated')::text, true);
select lives_ok(
  $$ select public.redeem_org_invite('tok-multi-use-00001') $$,
  'multi-use invite: 2nd redemption (== max_uses) succeeds'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000007','role','authenticated')::text, true);
select throws_like(
  $$ select public.redeem_org_invite('tok-multi-use-00001') $$,
  '%invite_exhausted%',
  'multi-use invite: 3rd redemption beyond max_uses is rejected'
);

-- ===== expired invite rejected =====
reset role;
select throws_like(
  $$ select public.redeem_org_invite('tok-expired-0000001') $$,
  '%invite_expired%',
  'an expired invite is rejected even with uses remaining'
);

-- ===== email-bound invite =====
do $$
declare wrong uuid := 'b0000002-0000-0000-0000-000000000008'; right_ uuid := 'b0000002-0000-0000-0000-000000000009';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', wrong, 'authenticated', 'authenticated', 'wrongperson@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', right_, 'authenticated', 'authenticated', 'onlyme@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (wrong, 'Wrong Person', true), (right_, 'Right Person', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000008', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000008','role','authenticated')::text, true);
select throws_like(
  $$ select public.redeem_org_invite('tok-email-bound-001') $$,
  '%email_mismatch%',
  'an email-bound invite rejects a signed-in email that does not match'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000002-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000002-0000-0000-0000-000000000009','role','authenticated')::text, true);
select lives_ok(
  $$ select public.redeem_org_invite('tok-email-bound-001') $$,
  'an email-bound invite is redeemable by the matching email'
);

-- ===== admin_resolve_report =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);
select throws_like(
  format($$ select public.admin_resolve_report(%L::uuid, 'c0000001-0000-0000-0000-000000000001'::uuid, 'dismiss') $$, current_setting('vouchline_test.org1')),
  '%not_authorized%',
  'non-admin cannot resolve reports'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select lives_ok(
  format($$ select public.admin_resolve_report(%L::uuid, 'c0000001-0000-0000-0000-000000000001'::uuid, 'dismiss') $$, current_setting('vouchline_test.org1')),
  'admin can dismiss a report'
);

select lives_ok(
  format($$ select public.admin_resolve_report(%L::uuid, 'c0000001-0000-0000-0000-000000000002'::uuid, 'remove_member') $$, current_setting('vouchline_test.org1')),
  'admin can act on a report by removing the member'
);

reset role;
select is(
  (select status from public.memberships
     where org_id = (current_setting('vouchline_test.org1'))::uuid
       and user_id = 'b0000001-0000-0000-0000-000000000002'::uuid),
  'removed',
  'remove_member action sets the membership status to removed'
);

select * from finish();
rollback;
