create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

-- ===== fixtures =====
do $$
declare
  a uuid := 'c0000001-0000-0000-0000-000000000001';
  b uuid := 'c0000001-0000-0000-0000-000000000002';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'strength_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'strength_b@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (a, 'Strength A', true), (b, 'Strength B', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','c0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- ===== the new top of the range (5) is accepted =====
select lives_ok(
  $$ select public.request_connection(
       'c0000001-0000-0000-0000-000000000002'::uuid,
       '[{"category":"friend","is_primary":true}]'::jsonb, 3, 5
     ) $$,
  'strength 5 (the new top of the range) is accepted'
);

-- ===== 6 is rejected (still a 5-point scale, not open-ended) =====
select throws_like(
  $$ select public.request_connection(
       gen_random_uuid(), '[{"category":"friend","is_primary":true}]'::jsonb, 1, 6
     ) $$,
  '%check constraint%',
  'strength 6 is rejected -- the scale still has a top'
);

-- ===== 0 is still rejected (the scale starts at 1, same as before) =====
select throws_like(
  $$ select public.request_connection(
       gen_random_uuid(), '[{"category":"friend","is_primary":true}]'::jsonb, 1, 0
     ) $$,
  '%check constraint%',
  'strength 0 is rejected -- the scale still starts at 1'
);

-- ===== eff_strength (least of both sides) reflects the wider range once
-- both sides have answered, and stays private -- never returned by
-- my_connections() as a number or exposed anywhere else =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','c0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select public.answer_connection(
  (select connection_id from public.pending_for_me() limit 1),
  '[{"category":"friend","is_primary":true}]'::jsonb, 3, 4
);

reset role;
select is(
  (select eff_strength from public.connections
     where user_lo = 'c0000001-0000-0000-0000-000000000001'::uuid and user_hi = 'c0000001-0000-0000-0000-000000000002'::uuid),
  4::smallint,
  'eff_strength is the lower of the two 5-point answers (5 vs 4 -> 4)'
);

select * from finish();
rollback;
