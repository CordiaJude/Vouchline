create extension if not exists pgtap with schema extensions;

begin;
select plan(9);

-- ===== fixtures =====
-- Org O1: A (caller), B (same employer "Acme Co", same org), C (same
-- employer, different org, private -- must never appear), D (same
-- employer, different org, public -- must appear), BLK (same employer,
-- same org, but A blocks them -- must never appear), E (different
-- employer "Globex Inc", same org as A -- visible, but never counted
-- toward the Acme Co page).
do $$
declare
  a uuid := 'f0000009-0000-0000-0000-000000000001';
  b uuid := 'f0000009-0000-0000-0000-000000000002';
  c uuid := 'f0000009-0000-0000-0000-000000000003';
  d uuid := 'f0000009-0000-0000-0000-000000000004';
  blk uuid := 'f0000009-0000-0000-0000-000000000005';
  e uuid := 'f0000009-0000-0000-0000-000000000006';
  org1 uuid := 'f000000a-0000-0000-0000-000000000001';
  org2 uuid := 'f000000a-0000-0000-0000-000000000002';
  uid_ uuid;
begin
  foreach uid_ in array array[a,b,c,d,blk,e]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
  end loop;

  insert into public.profiles (id, full_name, employer, is_public, is_18_plus) values
    (a, 'Alice Acme', 'Acme Co', false, true),
    (b, 'Bob Acme', 'ACME CO', false, true),
    (c, 'Carol Acme', 'Acme Co', false, true),
    (d, 'Dave Acme', 'Acme Co', true, true),
    (blk, 'Blake Acme', 'Acme Co', false, true),
    (e, 'Erin Elsewhere', 'Globex Inc', false, true);

  insert into public.orgs (id, name, slug, kind) values
    (org1, 'Company Org One', 'company-org-1', 'chapter'),
    (org2, 'Company Org Two', 'company-org-2', 'chapter');

  insert into public.memberships (org_id, user_id, status) values
    (org1, a, 'active'),
    (org1, b, 'active'),
    (org1, blk, 'active'),
    (org1, e, 'active'),
    (org2, c, 'active'),
    (org2, d, 'active');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000009-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','f0000009-0000-0000-0000-000000000001','role','authenticated')::text, true);

insert into public.blocks (blocker_id, blocked_id) values
  ('f0000009-0000-0000-0000-000000000001', 'f0000009-0000-0000-0000-000000000005');

-- ===== company_members: org-mate with a different-case spelling still matches =====
select is(
  (select count(*)::int from public.company_members('Acme Co')),
  2,
  'company_members returns exactly B (org-mate) and D (public), case-insensitively matched'
);

select is(
  (select bool_or(full_name = 'Bob Acme') from public.company_members('Acme Co')),
  true,
  'the org-mate with different casing (ACME CO) is included'
);

select is(
  (select bool_or(full_name = 'Dave Acme') from public.company_members('Acme Co')),
  true,
  'the public profile in a different org is included'
);

-- ===== private cross-org profile never appears =====
select is(
  (select bool_or(full_name = 'Carol Acme') from public.company_members('Acme Co')),
  false,
  'a private profile with no shared org never appears'
);

-- ===== blocked user never appears even if same employer and org =====
select is(
  (select bool_or(full_name = 'Blake Acme') from public.company_members('Acme Co')),
  false,
  'a blocked user never appears'
);

-- ===== a company page still works for an employer that isn't the caller's own =====
select is(
  (select count(*)::int from public.company_members('Globex Inc')),
  1,
  'E (Globex Inc, shares org1 with A) is visible on the Globex Inc company page'
);

-- ===== relationship_status defaults to none for a stranger at the same company =====
select is(
  (select relationship_status from public.company_members('Acme Co') where full_name = 'Dave Acme'),
  'none',
  'relationship_status is none for someone with no connection at all'
);

-- ===== list_companies: aggregates and preserves a real casing, not always-lowercase =====
select is(
  (select member_count from public.list_companies() where employer = 'ACME CO' or employer = 'Acme Co'),
  2,
  'list_companies counts Acme Co members visible to the caller (B and D)'
);

select is(
  (select bool_or(employer ~ '^[a-z ]+$') from public.list_companies()),
  false,
  'list_companies never force-lowercases the display name'
);

select finish();
rollback;
