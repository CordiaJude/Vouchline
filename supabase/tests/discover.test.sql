create extension if not exists pgtap with schema extensions;

begin;
select plan(15);

-- ===== fixtures =====
-- Org O1: A (caller), B (confirmed friend of A), C (A claimed as mentor),
-- D (A sent a request to, unanswered by D -- pending_sent), E (sent a
-- request to A, unanswered by A -- pending_received), F (same employer as
-- A, no relationship, no edge -- for employer_overlap_suggestions), BLK
-- (blocked by A -- must never appear). G is in a different org entirely,
-- has no shared org and a private profile, so it must never appear in
-- A's discover_search results nor be selectable via profiles_select. H is
-- also in a different org with no shared org or relationship to A, but
-- has a public profile -- it must appear in Discover and be directly
-- selectable, since a public profile is visible to anyone. J is in a
-- different org too, with a private profile and NO shared org, but IS
-- confirmedly connected to A -- the Phase 3 false-negative bug: this used
-- to be invisible to discover_search/search_members even though
-- profiles_select (RLS) already allowed viewing J's profile directly.
do $$
declare
  a uuid := 'd0000001-0000-0000-0000-000000000001';
  b uuid := 'd0000001-0000-0000-0000-000000000002';
  c uuid := 'd0000001-0000-0000-0000-000000000003';
  d uuid := 'd0000001-0000-0000-0000-000000000004';
  e uuid := 'd0000001-0000-0000-0000-000000000005';
  f uuid := 'd0000001-0000-0000-0000-000000000006';
  blk uuid := 'd0000001-0000-0000-0000-000000000007';
  g uuid := 'd0000001-0000-0000-0000-000000000008';
  h uuid := 'd0000001-0000-0000-0000-000000000009';
  j uuid := 'd0000001-0000-0000-0000-00000000000a';
  org1 uuid := 'd0000002-0000-0000-0000-000000000001';
  org2 uuid := 'd0000002-0000-0000-0000-000000000002';
  uid_ uuid;
  conn_ab uuid;
  conn_aj uuid;
begin
  foreach uid_ in array array[a,b,c,d,e,f,blk,g,h,j]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
  end loop;

  insert into public.profiles (id, full_name, employer, is_18_plus, is_public) values
    (a, 'Alice Anderson', 'Acme Co', true, false),
    (b, 'Bob Brown', null, true, false),
    (c, 'Carol Carter', null, true, false),
    (d, 'Dave Davis', null, true, false),
    (e, 'Erin Evans', null, true, false),
    (f, 'Frank Foster', 'Acme Co', true, false),
    (blk, 'Blake Blocked', null, true, false),
    (g, 'Gina Gomez', null, true, false),
    (h, 'Hank Harris', null, true, true),
    (j, 'Jill Jones', null, true, false);

  insert into public.orgs (id, name, slug, kind) values
    (org1, 'Org One', 'discover-org-1', 'chapter'),
    (org2, 'Org Two', 'discover-org-2', 'chapter');

  insert into public.memberships (org_id, user_id, status) values
    (org1, a, 'active'),
    (org1, b, 'active'),
    (org1, c, 'active'),
    (org1, d, 'active'),
    (org1, e, 'active'),
    (org1, f, 'active'),
    (org1, blk, 'active'),
    (org2, g, 'active'),
    (org2, h, 'active'),
    (org2, j, 'active');

  -- A-B confirmed
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at) values
    (least(a,b), greatest(a,b), a, 'qr', 3, 2, now(), 3, 2, now())
    returning id into conn_ab;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_ab, 'lo', 'friend', true), (conn_ab, 'hi', 'friend', true);

  -- A-J confirmed, no shared org
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at) values
    (least(a,j), greatest(a,j), a, 'qr', 2, 2, now(), 2, 2, now())
    returning id into conn_aj;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_aj, 'lo', 'coworker', true), (conn_aj, 'hi', 'coworker', true);
end $$;

-- A claims C
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select public.claim_person('d0000001-0000-0000-0000-000000000003'::uuid, 'mentor', false, 5, null);

-- A sends a request to D (pending_sent from A's view)
select public.request_connection(
  'd0000001-0000-0000-0000-000000000004'::uuid,
  '[{"category":"business_contact","is_primary":true}]'::jsonb, 1, 2
);

-- A blocks BLK
insert into public.blocks (blocker_id, blocked_id) values
  ('d0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000007');

-- E sends a request to A (pending_received from A's view)
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000005','role','authenticated')::text, true);
select public.request_connection(
  'd0000001-0000-0000-0000-000000000001'::uuid,
  '[{"category":"coworker","is_primary":true}]'::jsonb, 1, 1
);

-- back to A for all discover_search / employer_overlap assertions
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- ===== relationship_status: confirmed =====
select is(
  (select relationship_status from public.discover_search('Bob', null, 0)),
  'confirmed',
  'discover_search reports confirmed status for B'
);

-- ===== relationship_status: claimed =====
select is(
  (select relationship_status from public.discover_search('Carol', null, 0)),
  'claimed',
  'discover_search reports claimed status for C'
);

select is(
  (select category::text from public.discover_search('Carol', null, 0)),
  'mentor',
  'discover_search reports the claimed category for C'
);

-- ===== relationship_status: pending_sent =====
select is(
  (select relationship_status from public.discover_search('Dave', null, 0)),
  'pending_sent',
  'discover_search reports pending_sent for D (A answered, D has not)'
);

-- ===== relationship_status: pending_received =====
select is(
  (select relationship_status from public.discover_search('Erin', null, 0)),
  'pending_received',
  'discover_search reports pending_received for E (E answered, A has not)'
);

-- ===== relationship_status: none =====
select is(
  (select relationship_status from public.discover_search('Frank', null, 0)),
  'none',
  'discover_search reports none for F (no relationship at all)'
);

-- ===== blocked users never appear =====
select is(
  (select count(*)::int from public.discover_search('Blake', null, 0)),
  0,
  'discover_search never returns a blocked user'
);

-- ===== org scoping: a private profile outside a shared org never appears =====
select is(
  (select count(*)::int from public.discover_search('Gina', null, 0)),
  0,
  'discover_search never returns a private profile outside a shared org'
);

-- ===== category filter =====
select is(
  (select count(*)::int from public.discover_search('a', 'mentor', 0)),
  1,
  'category filter narrows results to just the mentor match (C)'
);

-- ===== employer_overlap_suggestions: same employer, no direct edge =====
select is(
  (select array_agg(id) from public.employer_overlap_suggestions()),
  array['d0000001-0000-0000-0000-000000000006'::uuid],
  'employer_overlap_suggestions returns only F (same employer, no confirmed edge)'
);

-- ===== public profiles: visible in Discover across orgs =====
select is(
  (select count(*)::int from public.discover_search('Hank', null, 0)),
  1,
  'discover_search returns a public profile even without a shared org'
);

-- ===== public profiles: directly selectable by a stranger via RLS =====
select is(
  (select count(*)::int from public.profiles where id = 'd0000001-0000-0000-0000-000000000009'::uuid),
  1,
  'profiles_select allows a stranger to select a public profile directly'
);

-- ===== private profiles: still not selectable by a stranger =====
select is(
  (select count(*)::int from public.profiles where id = 'd0000001-0000-0000-0000-000000000008'::uuid),
  0,
  'profiles_select still blocks a stranger from a private profile with no shared org'
);

-- ===== Phase 3 fix: a confirmed direct connection with no shared org is
-- no longer a false negative in discover_search or search_members =====
select is(
  (select relationship_status from public.discover_search('Jill', null, 0)),
  'confirmed',
  'discover_search now finds J (confirmed, no shared org) -- the Find/Search false-negative bug'
);

select is(
  (select count(*)::int from public.search_members('Jill')),
  1,
  'search_members now finds J (confirmed, no shared org) -- the Find/Search false-negative bug'
);

select finish();
rollback;
