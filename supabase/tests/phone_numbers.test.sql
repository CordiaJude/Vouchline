create extension if not exists pgtap with schema extensions;

begin;
select plan(7);

do $$
declare
  a uuid := 'e0000047-0000-0000-0000-000000000001';
  b uuid := 'e0000047-0000-0000-0000-000000000002';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'phone_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'phone_b@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus, is_public) values
    (a, 'Phone A', true, true),
    (b, 'Phone B', true, true);
end $$;

-- B sets a number.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','e0000047-0000-0000-0000-000000000002','role','authenticated')::text, true);
select lives_ok($$ select public.set_my_phone('+15551234567') $$, 'member can set their phone');
select throws_ok($$ select public.set_my_phone('555-1234') $$, 'P0001', 'invalid_phone', 'non-E.164 numbers are rejected');

-- A can't read B's number, but finds B by its hash.
select set_config('request.jwt.claims', json_build_object('sub','e0000047-0000-0000-0000-000000000001','role','authenticated')::text, true);
select is((select count(*)::int from public.profile_phones), 0, 'other members'' phone numbers are not readable');
select is(
  (select full_name from public.find_people_by_contact_hashes(null, array[encode(extensions.digest('+15551234567', 'sha256'), 'hex')])),
  'Phone B', 'a phone hash finds the member');
select is(
  (select count(*)::int from public.find_people_by_contact_hashes(array[encode(extensions.digest('phone_b@example.com', 'sha256'), 'hex')], null)),
  1, 'email hashes still match');

-- B deletes their account -> no longer matchable.
reset role;
update public.profiles set deleted_at = now() where id = 'e0000047-0000-0000-0000-000000000002';
select is((select count(*)::int from public.profile_phones where user_id = 'e0000047-0000-0000-0000-000000000002'), 0, 'deleting the account removes the phone');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','e0000047-0000-0000-0000-000000000001','role','authenticated')::text, true);
select is(
  (select count(*)::int from public.find_people_by_contact_hashes(null, array[encode(extensions.digest('+15551234567', 'sha256'), 'hex')])),
  0, 'deleted members are not matched');

select * from finish();
rollback;
