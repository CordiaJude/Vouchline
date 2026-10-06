create extension if not exists pgtap with schema extensions;

begin;
select plan(12);

-- ===== fixtures =====
-- Two users who share NO org at all (Phase 2's "no org gate" acceptance
-- criterion needs this), plus a third profile inserted later mid-test to
-- exercise the claim_stub_on_signup() merge trigger.
do $$
declare
  a uuid := 'f0000001-0000-0000-0000-000000000001';
  b uuid := 'f0000001-0000-0000-0000-000000000002';
  stub_signup uuid := 'f0000001-0000-0000-0000-000000000003';
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'claims_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', b, 'authenticated', 'authenticated', 'claims_b@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', stub_signup, 'authenticated', 'authenticated', 'stub_signup@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (a, 'Claims A', true),
    (b, 'Claims B', true);
end $$;

-- ===== new taxonomy: 'family' (not in the old 5-value enum) is accepted =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select lives_ok(
  $$ select public.request_connection(
       'f0000001-0000-0000-0000-000000000002'::uuid,
       '[{"category":"family","is_primary":true}]'::jsonb, 10, 3
     ) $$,
  'the new taxonomy value ''family'' is accepted by request_connection'
);

-- ===== is_former is carried per-category, and eff_is_former follows the
-- same lower-user_id-primary tiebreak as eff_type (A is user_lo here, so
-- eff_type/eff_is_former reflect A's "family"/false, not B's "boss"/true,
-- even though both sides answered) =====
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);

select lives_ok(
  $$ select public.answer_connection(
       (select connection_id from public.pending_for_me() limit 1),
       '[{"category":"boss","is_former":true,"is_primary":true}]'::jsonb, 8, 2
     ) $$,
  'B answers as a former boss'
);

reset role;
select is(
  (select eff_is_former from public.connections
     where least(user_lo,user_hi) = least('f0000001-0000-0000-0000-000000000001'::uuid,'f0000001-0000-0000-0000-000000000002'::uuid)),
  false,
  'eff_is_former follows the lower user_id''s primary (A''s "family", not former), not an OR across both sides'
);

-- ===== claim requires no shared org =====
-- a and b share no org at all (neither has any membership row).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select lives_ok(
  $$ select public.claim_person('f0000001-0000-0000-0000-000000000002'::uuid, 'mentor', false, 4, 'Great mentor') $$,
  'claim_person works between two users who share no org'
);

select throws_like(
  $$ select public.claim_person('f0000001-0000-0000-0000-000000000001'::uuid, 'friend', false, 1, null) $$,
  '%cannot_claim_self%',
  'claiming yourself is rejected'
);

-- claim_person/claim_stub are SECURITY DEFINER and read auth.uid() from
-- the request.jwt.claim.sub GUC (set above, transaction-local -- it
-- survives a role reset), so they still work correctly as postgres.
-- claimed_connections and person_stubs both have RLS enabled with no
-- policies (RPC-only), so a direct SELECT against them as role
-- authenticated would see zero rows regardless of who owns them.
reset role;

-- ===== stub dedup by linkedin_url =====
select public.claim_stub('Not Yet Here', 'https://www.linkedin.com/in/notyethere', 'classmate', false, 2, null);
select public.claim_stub('Not Yet Here Again', 'https://www.linkedin.com/in/notyethere', 'business_contact', false, 1, null);

select is(
  (select count(*)::int from public.person_stubs where linkedin_url = 'https://www.linkedin.com/in/notyethere'),
  1,
  'claiming the same linkedin_url twice resolves to a single deduped stub row'
);

select is(
  (select count(*)::int from public.claimed_connections cc
     join public.person_stubs s on s.id = cc.claimed_stub_id
     where s.linkedin_url = 'https://www.linkedin.com/in/notyethere'),
  2,
  'both claims point at the single deduped stub'
);

-- ===== claiming an existing user by linkedin_url resolves to them, not a stub =====
update public.profiles set linkedin_url = 'https://www.linkedin.com/in/claimsb' where id = 'f0000001-0000-0000-0000-000000000002'::uuid;

-- claim_stub() has to run as its own statement, not nested inside the
-- WHERE clause of a SELECT reading the same table it just inserted
-- into -- that outer SELECT's snapshot is fixed before the nested
-- call's INSERT becomes visible, so it would never find the new row.
select public.claim_stub('Claims B', 'https://www.linkedin.com/in/claimsb', 'friend', false, 1, null);

select is(
  (select claimed_person_id from public.claimed_connections
     where claimant_id = 'f0000001-0000-0000-0000-000000000001'::uuid and category = 'friend'),
  'f0000001-0000-0000-0000-000000000002'::uuid,
  'claim_stub resolves to a real account when the linkedin_url already belongs to one'
);

select is(
  (select count(*)::int from public.person_stubs where linkedin_url = 'https://www.linkedin.com/in/claimsb'),
  0,
  'no phantom stub was created for someone already on the platform'
);

-- ===== claim_stub_on_signup: merging a stub into a real account =====
select public.claim_stub('Future Signup', 'https://www.linkedin.com/in/futuresignup', 'coworker', false, 3, 'from a conference');

select ok(
  exists (select 1 from public.person_stubs where linkedin_url = 'https://www.linkedin.com/in/futuresignup'),
  'the stub exists before its person signs up'
);

-- The matching person signs up with the same linkedin_url -- this fires
-- private.claim_stub_on_signup() via the AFTER INSERT trigger. Insert as
-- postgres (bypassing RLS) since profiles' insert policy only allows a
-- user to insert their own row, and we're still in f...001's session.
reset role;
insert into public.profiles (id, full_name, is_18_plus, linkedin_url)
values ('f0000001-0000-0000-0000-000000000003'::uuid, 'Future Signup', true, 'https://www.linkedin.com/in/futuresignup');

select is(
  (select claimed_person_id from public.claimed_connections
     where claimant_id = 'f0000001-0000-0000-0000-000000000001'::uuid and category = 'coworker'),
  'f0000001-0000-0000-0000-000000000003'::uuid,
  'the claim was reassigned onto the real profile after signup'
);

select is(
  (select count(*)::int from public.person_stubs where linkedin_url = 'https://www.linkedin.com/in/futuresignup'),
  0,
  'the stub is removed once merged'
);

select * from finish();
rollback;
