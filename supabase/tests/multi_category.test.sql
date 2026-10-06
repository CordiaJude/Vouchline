create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- ===== fixtures =====
-- A and B, where A < B (A is user_lo). A selects friend (primary) +
-- coworker; B selects only coworker (primary). Coworker is confirmed to
-- both since both picked it; friend is private to A only.
do $$
declare
  a uuid := 'b0000001-0000-0000-0000-000000000001';
  b uuid := 'b0000001-0000-0000-0000-000000000002';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'mc_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'mc_b@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (a, 'MC A', true), (b, 'MC B', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select lives_ok(
  $$ select public.request_connection(
       'b0000001-0000-0000-0000-000000000002'::uuid,
       '[{"category":"friend","is_primary":true},{"category":"coworker"}]'::jsonb, 3, 2
     ) $$,
  'A requests a connection to B with two categories, friend primary'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select lives_ok(
  $$ select public.answer_connection(
       (select connection_id from public.pending_for_me() limit 1),
       '[{"category":"coworker","is_primary":true}]'::jsonb, 2, 1
     ) $$,
  'B answers with only coworker'
);

reset role;

-- ===== eff_type/eff_is_former: coworker is NOT primary for A (friend
-- is), so on this A-B pair the tiebreak follows A's primary (friend),
-- even though coworker is the one both sides actually confirmed -- exactly
-- the documented display-only tiebreak, not a re-ranking of what's real. =====
select is(
  (select eff_type from public.connections
     where user_lo = 'b0000001-0000-0000-0000-000000000001'::uuid and user_hi = 'b0000001-0000-0000-0000-000000000002'::uuid),
  'friend'::public.rel_type,
  'eff_type follows the lower user_id''s primary (A''s friend)'
);

-- ===== A's own view: both categories show, friend flagged unconfirmed,
-- coworker flagged confirmed =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is(
  (select jsonb_array_length(my_categories) from public.my_connections()
     where other_id = 'b0000001-0000-0000-0000-000000000002'::uuid),
  2,
  'A sees both categories they selected'
);

select is(
  (select (c->>'confirmed')::boolean from public.my_connections(), jsonb_array_elements(my_categories) c
     where other_id = 'b0000001-0000-0000-0000-000000000002'::uuid and c->>'category' = 'friend'),
  false,
  'A''s "friend" is flagged unconfirmed -- B never picked it'
);

select is(
  (select (c->>'confirmed')::boolean from public.my_connections(), jsonb_array_elements(my_categories) c
     where other_id = 'b0000001-0000-0000-0000-000000000002'::uuid and c->>'category' = 'coworker'),
  true,
  'A''s "coworker" is flagged confirmed -- both sides picked it'
);

-- ===== B's own view: only ever sees what B themselves selected. B's
-- category list contains exactly ["coworker"] -- A's private "friend"
-- never appears anywhere in a query scoped to B. =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select is(
  (select my_categories from public.my_connections() where other_id = 'b0000001-0000-0000-0000-000000000001'::uuid),
  '[{"category": "coworker", "is_former": false, "is_primary": true, "confirmed": true}]'::jsonb,
  'B''s my_connections() shows only coworker -- A''s private "friend" never leaks to B'
);

select is(
  (select categories from public.how_connected('b0000001-0000-0000-0000-000000000001'::uuid)),
  '[{"category": "coworker", "is_former": false, "is_primary": true, "confirmed": true}]'::jsonb,
  'B''s how_connected() also shows only coworker -- same non-leak, different RPC'
);

-- ===== third party: find_brokers only ever surfaces the single
-- display/color value (eff_type), never a full category list, and never
-- anyone's private-only categories as a set =====
reset role;
do $$
declare
  c uuid := 'b0000001-0000-0000-0000-000000000003';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', c, 'authenticated', 'authenticated', 'mc_c@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (c, 'MC C', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);

select is(
  (select count(*)::int from public.find_brokers('b0000001-0000-0000-0000-000000000002'::uuid)),
  0,
  'C (a stranger) has no path to B through A/B yet -- sanity check before the next assertion'
);

-- ===== both sides select the exact same two categories: both fully
-- confirmed, no private-only entries on either side =====
reset role;
do $$
declare
  d uuid := 'b0000001-0000-0000-0000-000000000004';
  e uuid := 'b0000001-0000-0000-0000-000000000005';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', d, 'authenticated', 'authenticated', 'mc_d@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', e, 'authenticated', 'authenticated', 'mc_e@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (d, 'MC D', true), (e, 'MC E', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000004','role','authenticated')::text, true);

select public.request_connection(
  'b0000001-0000-0000-0000-000000000005'::uuid,
  '[{"category":"friend","is_primary":true},{"category":"coworker"}]'::jsonb, 3, 2
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000005','role','authenticated')::text, true);

select public.answer_connection(
  (select connection_id from public.pending_for_me() limit 1),
  '[{"category":"friend","is_primary":true},{"category":"coworker"}]'::jsonb, 3, 2
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000004','role','authenticated')::text, true);

select is(
  (select bool_and((c->>'confirmed')::boolean) from public.my_connections(), jsonb_array_elements(my_categories) c
     where other_id = 'b0000001-0000-0000-0000-000000000005'::uuid),
  true,
  'when both sides pick the same two categories, both are confirmed -- no private-only entries'
);

-- ===== write_connection_categories rejects a malformed submission (no
-- category marked primary) rather than silently picking one =====
reset role;
do $$
declare
  f uuid := 'b0000001-0000-0000-0000-000000000006';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', f, 'authenticated', 'authenticated', 'mc_f@example.com', '{}', '{}', now(), now());
  insert into public.profiles (id, full_name, is_18_plus) values (f, 'MC F', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000001-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000006','role','authenticated')::text, true);

select throws_like(
  $$ select public.request_connection(
       'b0000001-0000-0000-0000-000000000003'::uuid,
       '[{"category":"friend"},{"category":"coworker"}]'::jsonb, 1, 1
     ) $$,
  '%exactly_one_primary_required%',
  'a submission with no category marked primary is rejected'
);

select * from finish();
rollback;
