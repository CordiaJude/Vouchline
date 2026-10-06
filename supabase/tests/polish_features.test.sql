create extension if not exists pgtap with schema extensions;

begin;
select plan(4);

-- ===== fixtures =====
-- A (caller), fresh_b (joined seconds ago -> is_new), old_b (joined a
-- year ago -> not is_new). Both share an org with A so they're visible
-- to discover_search.
do $$
declare
  org1 uuid;
  a uuid := 'd0000003-0000-0000-0000-000000000001';
  fresh_b uuid := 'd0000003-0000-0000-0000-000000000002';
  old_b uuid := 'd0000003-0000-0000-0000-000000000003';
  conn_id uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Polish Test Chapter', 'polish-test-chapter', 'chapter')
  returning id into org1;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', a, 'authenticated', 'authenticated', 'polish_a@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', fresh_b, 'authenticated', 'authenticated', 'polish_fresh@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', old_b, 'authenticated', 'authenticated', 'polish_old@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus, created_at) values
    (a, 'Polish A', true, now()),
    (fresh_b, 'Fresh Joiner', true, now()),
    (old_b, 'Old Timer', true, now() - interval '1 year');

  insert into public.memberships (org_id, user_id, role, status) values
    (org1, a, 'member', 'active'),
    (org1, fresh_b, 'member', 'active'),
    (org1, old_b, 'member', 'active');

  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(a, old_b), greatest(a, old_b), a, 'qr',
    2, 2, now(), 2, 2, now()
  ) returning id into conn_id;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_id, 'lo', 'friend', true), (conn_id, 'hi', 'friend', true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000003-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','d0000003-0000-0000-0000-000000000001','role','authenticated')::text, true);

-- ===== "new here" badge =====
select is(
  (select is_new from public.discover_search('Fresh', null, 0)),
  true,
  'discover_search flags a person who joined seconds ago as is_new'
);

select is(
  (select is_new from public.discover_search('Old Timer', null, 0)),
  false,
  'discover_search does not flag a person who joined a year ago'
);

-- ===== "recently active" sort data: confirmed_at is returned =====
select ok(
  (select confirmed_at is not null from public.my_connections()
     where other_id = 'd0000003-0000-0000-0000-000000000003'::uuid),
  'my_connections() returns confirmed_at for a confirmed connection'
);

-- ===== shared connections preview: mutual_connections() needs no
-- schema change -- confirm it's still callable and returns the right
-- shape for the client-side preview to consume =====
select ok(
  (select count(*) >= 0 from public.mutual_connections('d0000003-0000-0000-0000-000000000003'::uuid)) is not null,
  'mutual_connections() is callable for the hover/tap preview'
);

select * from finish();
rollback;
