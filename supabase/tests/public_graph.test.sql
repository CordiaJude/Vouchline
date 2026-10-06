create extension if not exists pgtap with schema extensions;

begin;
select plan(11);

-- ===== fixtures =====
-- Viewer V. Chain: V -(private on V's side)- A -(public both)- B -(public both)- C
--   V-A  confirmed, V chose private, A chose public -> V sees it (own edge);
--        nobody else does
--   A-B  confirmed, both public, both picked 'friend' -> visible, colored
--   B-C  confirmed, both public, categories differ   -> visible, uncolored
--   A-Q  confirmed, A public, Q private               -> hidden from V
--   C-Z  confirmed, both never asked (null)           -> hidden (legacy = private)
--   B-BLK confirmed, both public, V blocked BLK       -> hidden from V
--   X-Y  confirmed, both public, not reachable from V -> hidden from V
do $$
declare
  v   uuid := 'e0000001-0000-0000-0000-000000000001';
  a   uuid := 'e0000001-0000-0000-0000-000000000002';
  b   uuid := 'e0000001-0000-0000-0000-000000000003';
  c_  uuid := 'e0000001-0000-0000-0000-000000000004';
  q   uuid := 'e0000001-0000-0000-0000-000000000005';
  blk uuid := 'e0000001-0000-0000-0000-000000000006';
  z   uuid := 'e0000001-0000-0000-0000-000000000007';
  x   uuid := 'e0000001-0000-0000-0000-000000000008';
  y   uuid := 'e0000001-0000-0000-0000-000000000009';
  uid_ uuid;
  cid uuid;
begin
  foreach uid_ in array array[v,a,b,c_,q,blk,z,x,y]
  loop
    insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', uid_, 'authenticated', 'authenticated', uid_ || '@example.com', '{}', '{}', now(), now());
    insert into public.profiles (id, full_name, is_18_plus) values (uid_, 'User ' || right(uid_::text, 2), true);
  end loop;

  -- helper pattern: confirmed connection with explicit per-side visibility
  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(v,a), greatest(v,a), v, 'qr', 3, 2, now(), 3, 2, now(),
            case when least(v,a) = v then false else true end,
            case when greatest(v,a) = v then false else true end);

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(a,b), greatest(a,b), a, 'qr', 3, 2, now(), 3, 2, now(), true, true) returning id into cid;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (cid, 'lo', 'friend', true), (cid, 'hi', 'friend', true);

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(b,c_), greatest(b,c_), b, 'qr', 3, 2, now(), 3, 2, now(), true, true) returning id into cid;
  insert into public.connection_categories (connection_id, side, category, is_primary) values
    (cid, 'lo', 'coworker', true), (cid, 'hi', 'classmate', true);

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(a,q), greatest(a,q), a, 'qr', 3, 2, now(), 3, 2, now(),
            case when least(a,q) = a then true else false end,
            case when greatest(a,q) = a then true else false end);

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at)
    values (least(c_,z), greatest(c_,z), c_, 'qr', 3, 2, now(), 3, 2, now());

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(b,blk), greatest(b,blk), b, 'qr', 3, 2, now(), 3, 2, now(), true, true);
  insert into public.blocks (blocker_id, blocked_id) values (v, blk);

  insert into public.connections (user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at, hi_years, hi_strength, hi_answered_at, lo_public, hi_public)
    values (least(x,y), greatest(x,y), x, 'qr', 3, 2, now(), 3, 2, now(), true, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);

select is((select count(*)::int from public.public_graph()), 3,
  'V sees own edge V-A plus the public chain A-B and B-C');

select ok(exists (select 1 from public.public_graph() g where involves_me
                  and 'e0000001-0000-0000-0000-000000000002'::uuid in (src_id, dst_id)),
  'own edge is visible to self even when marked private');

select ok(exists (select 1 from public.public_graph() g
                  where 'e0000001-0000-0000-0000-000000000003'::uuid in (src_id, dst_id)
                    and 'e0000001-0000-0000-0000-000000000004'::uuid in (src_id, dst_id)),
  'two hops out: friend-of-friend public edge is visible');

select is((select shared_type::text from public.public_graph() g
           where 'e0000001-0000-0000-0000-000000000002'::uuid in (src_id, dst_id)
             and 'e0000001-0000-0000-0000-000000000003'::uuid in (src_id, dst_id)),
  'friend', 'edge colored by the category both sides picked');

select is((select shared_type::text from public.public_graph() g
           where 'e0000001-0000-0000-0000-000000000004'::uuid in (src_id, dst_id)),
  null, 'no shared category -> no type');

select ok(not exists (select 1 from public.public_graph() g
                      where 'e0000001-0000-0000-0000-000000000005'::uuid in (src_id, dst_id)),
  'one side private -> hidden');

select ok(not exists (select 1 from public.public_graph() g
                      where 'e0000001-0000-0000-0000-000000000007'::uuid in (src_id, dst_id)),
  'never-asked (legacy) connections stay private');

select ok(not exists (select 1 from public.public_graph() g
                      where 'e0000001-0000-0000-0000-000000000006'::uuid in (src_id, dst_id)),
  'blocked people never appear');

select ok(not exists (select 1 from public.public_graph() g
                      where 'e0000001-0000-0000-0000-000000000008'::uuid in (src_id, dst_id)),
  'public edges not reachable from the caller are not shown');

-- B (a stranger to V) must not see V-A, because V marked it private.
select set_config('request.jwt.claim.sub', 'e0000001-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', json_build_object('sub','e0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);
select ok(not exists (select 1 from public.public_graph() g
                      where 'e0000001-0000-0000-0000-000000000001'::uuid in (src_id, dst_id)),
  'a connection one side marked private is invisible to everyone else');

reset role;
select ok(not has_function_privilege('anon', 'public.set_connection_visibility(uuid, boolean)', 'execute'),
  'anon cannot call set_connection_visibility');

select * from finish();
rollback;
