create extension if not exists pgtap with schema extensions;

begin;
select plan(6);

do $$
declare
  org1 uuid;
  uid uuid := '44444444-4444-4444-4444-444444444444';
  other uuid := '55555555-5555-5555-5555-555555555555';
  conn_id uuid;
begin
  insert into public.orgs (id, name, slug, kind)
  values (gen_random_uuid(), 'Delete Test Org', 'delete-test-org', 'chapter')
  returning id into org1;

  insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'd@example.com', '{}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', other, 'authenticated', 'authenticated', 'o@example.com', '{}', '{}', now(), now());

  insert into public.profiles (id, full_name, is_18_plus) values
    (uid, 'Delete Me', true),
    (other, 'Other Person', true);

  insert into public.memberships (org_id, user_id, role, status) values
    (org1, uid, 'member', 'active'),
    (org1, other, 'member', 'active');

  insert into public.connections (
    user_lo, user_hi, initiated_by, source,
    lo_years, lo_strength, lo_answered_at,
    hi_years, hi_strength, hi_answered_at
  ) values (
    least(uid, other), greatest(uid, other), uid, 'qr',
    2, 2, now(), 2, 2, now()
  ) returning id into conn_id;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (conn_id, 'lo', 'friend', true),
    (conn_id, 'hi', 'friend', true);
end $$;

select is(
  (select count(*) from public.connection_edges where src = '44444444-4444-4444-4444-444444444444')::int, 1,
  'edge exists before delete'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text,
  true
);

select lives_ok(
  $$ select public.delete_my_account() $$,
  'delete_my_account runs without error for the authenticated caller'
);

reset role;

select is(
  (select deleted_at is not null from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  true,
  'profile soft-deleted (deleted_at set)'
);

select is(
  (select status from public.memberships where org_id in (select id from public.orgs where slug = 'delete-test-org') and user_id = '44444444-4444-4444-4444-444444444444'),
  'removed',
  'membership status set to removed'
);

select is(
  (select status from public.connections where least(user_lo,user_hi) = least('44444444-4444-4444-4444-444444444444'::uuid,'55555555-5555-5555-5555-555555555555'::uuid)),
  'revoked',
  'connection status set to revoked'
);

select is(
  (select count(*) from public.connection_edges where src = '44444444-4444-4444-4444-444444444444')::int, 0,
  'edges removed after revoke'
);

select * from finish();
rollback;
