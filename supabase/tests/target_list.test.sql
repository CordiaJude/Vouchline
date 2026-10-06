create extension if not exists pgtap with schema extensions;

begin;
select plan(14);

-- ===== fixtures =====
-- A is the owner. B is an existing member A wants to target. A also
-- targets a stub (Casey, no account yet). Later, Casey signs up with a
-- matching LinkedIn URL to prove the stub-merge trigger reassigns the
-- target entry.
do $$
declare
  a uuid := 'e0000009-0000-0000-0000-000000000001';
  b uuid := 'e0000009-0000-0000-0000-000000000002';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'target_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'target_b@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (a, 'Target A', true),
    (b, 'Target B', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- ===== cannot target self =====
select throws_like(
  $$ select public.add_target('e0000009-0000-0000-0000-000000000001'::uuid, null) $$,
  '%cannot_target_self%',
  'add_target rejects targeting yourself'
);

-- ===== add a real-account target =====
select lives_ok(
  $$ select public.add_target('e0000009-0000-0000-0000-000000000002'::uuid, 'Met at a conference') $$,
  'add_target succeeds for an existing member'
);

select is(
  (select count(*)::int from public.my_target_list()),
  1,
  'my_target_list shows exactly the one target added so far'
);

select is(
  (select stage from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000002'::uuid),
  'watching'::public.target_stage,
  'a newly added target defaults to the watching stage'
);

-- ===== re-adding the same person updates the note instead of duplicating =====
select public.add_target('e0000009-0000-0000-0000-000000000002'::uuid, 'Updated note');

select is(
  (select count(*)::int from public.my_target_list()),
  1,
  'adding the same target again does not create a duplicate row'
);

select is(
  (select note from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000002'::uuid),
  'Updated note',
  're-adding the same target updates the note'
);

-- ===== stage transitions =====
select public.set_target_stage(
  (select id from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000002'::uuid),
  'reaching_out'
);

select is(
  (select stage from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000002'::uuid),
  'reaching_out'::public.target_stage,
  'set_target_stage updates the stage'
);

-- ===== add a stub target, then prove the signup-merge trigger reassigns it =====
select public.add_target_stub('Casey Contact', 'https://www.linkedin.com/in/target-casey', 'Warm intro candidate');

select is(
  (select count(*)::int from public.my_target_list()),
  2,
  'my_target_list now shows the real target plus the stub target'
);

select is(
  (select is_stub from public.my_target_list() where note = 'Warm intro candidate'),
  true,
  'the stub target is flagged is_stub = true'
);

reset role;
do $$
declare
  casey uuid := 'e0000009-0000-0000-0000-000000000003';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', casey, 'authenticated', 'authenticated', 'target_casey@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, linkedin_url, is_18_plus)
  values (casey, 'Casey Contact', 'https://www.linkedin.com/in/target-casey', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_target_list()),
  2,
  'still exactly two targets after Casey signs up -- the stub merged onto the real account, not a new row'
);

select is(
  (select is_stub from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000003'::uuid),
  false,
  'the merged target is no longer flagged is_stub'
);

-- ===== removal, and RLS isolation from another user =====
select public.remove_target(
  (select id from public.my_target_list() where target_id = 'e0000009-0000-0000-0000-000000000002'::uuid)
);

select is(
  (select count(*)::int from public.my_target_list()),
  1,
  'remove_target deletes the entry'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000009-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000009-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.my_target_list()),
  0,
  'B''s target list is empty -- A''s targets are private and never leak across users'
);

-- ===== rate limit: 60/hour shared by add_target + add_target_stub, keyed
-- per-caller -- a dedicated user so this doesn't disturb A's counts above =====
reset role;
do $$
declare
  limiter uuid := 'e0000009-0000-0000-0000-000000000004';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', limiter, 'authenticated', 'authenticated', 'target_limiter@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (limiter, 'Rate Limiter', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000009-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000009-0000-0000-0000-000000000004','role','authenticated')::text, true);

do $$
declare i int;
begin
  for i in 1..60 loop
    perform public.add_target_stub('Rate Limit Stub ' || i);
  end loop;
end $$;

select throws_like(
  $$ select public.add_target_stub('One Too Many') $$,
  '%rate_limited%',
  'a 61st add_target/add_target_stub call within an hour is rejected'
);

select finish();
rollback;
