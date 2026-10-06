-- ===== Phase B: multi-category relationships (NEW SCHEMA) =====
-- Replaces the single lo_type/hi_type/eff_type columns on connections
-- with a proper multi-select per side. A category is "confirmed" (shown
-- to both sides, full weight everywhere) only if BOTH sides selected it;
-- a category selected by only one side is private to that side and is
-- never returned by any RPC scoped to the other party or to a third
-- party. This replaces the old exact-match rule (eff_type was null the
-- instant lo_type <> hi_type) with something that actually reflects two
-- people's independent, multi-valued views of the same relationship.
--
-- claimed_connections (the one-sided "claim" feature) is unaffected --
-- it stays single-category, since the spec for this phase only covers
-- confirmed connections.
create table public.connection_categories (
  connection_id uuid not null references public.connections(id) on delete cascade,
  side text not null check (side in ('lo', 'hi')),
  category public.rel_type not null,
  is_former boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (connection_id, side, category)
);
create index connection_categories_connection_idx on public.connection_categories(connection_id);
-- Exactly one primary per side, enforced structurally rather than only
-- by the write path (private.write_connection_categories below already
-- enforces it too, but a DB constraint is the real guarantee).
create unique index connection_categories_one_primary_idx
  on public.connection_categories(connection_id, side) where is_primary;

alter table public.connection_categories enable row level security;
-- no policies: RPC-only, same pattern as connections/connection_edges.

-- Validates and (re)writes one side's full category set in one call --
-- callers always resubmit their whole selection, matching the "re-answer
-- replaces the prior answer" semantics that predate multi-category.
create or replace function private.write_connection_categories(
  p_connection_id uuid,
  p_side text,
  p_categories jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  elem jsonb;
  cat text;
  primary_count int := 0;
  seen text[] := '{}';
begin
  if jsonb_typeof(p_categories) is distinct from 'array' then
    raise exception 'invalid_categories';
  end if;
  if jsonb_array_length(p_categories) < 1 or jsonb_array_length(p_categories) > 10 then
    raise exception 'invalid_categories';
  end if;

  for elem in select * from jsonb_array_elements(p_categories) loop
    cat := elem->>'category';
    if cat is null or cat = any(seen) then
      raise exception 'invalid_categories';
    end if;
    begin
      perform cat::public.rel_type;
    exception when invalid_text_representation then
      raise exception 'invalid_categories';
    end;
    seen := seen || cat;
    if coalesce((elem->>'is_primary')::boolean, false) then
      primary_count := primary_count + 1;
    end if;
  end loop;

  if primary_count <> 1 then
    raise exception 'exactly_one_primary_required';
  end if;

  delete from public.connection_categories
    where connection_id = p_connection_id and side = p_side;

  insert into public.connection_categories (connection_id, side, category, is_former, is_primary)
  select p_connection_id, p_side, (e->>'category')::public.rel_type,
         coalesce((e->>'is_former')::boolean, false),
         coalesce((e->>'is_primary')::boolean, false)
  from jsonb_array_elements(p_categories) e;
end;
$$;

-- ===== recompute_connection: eff_type/eff_is_former now come from the
-- confirmed-primary tiebreak (lower user_id's primary wins on a
-- mismatch -- a display default only, per the spec's own risk note, not
-- a re-ranking of anyone's stated relationship) instead of an exact
-- lo_type = hi_type match. eff_years/eff_strength are unchanged (years
-- and closeness stay whole-relationship scalars, not per-category). By
-- the time both lo_answered_at and hi_answered_at are set, both sides'
-- connection_categories rows are guaranteed to already exist -- see
-- private.upsert_connection_answer, which always writes this side's
-- category rows before flipping this side's answered_at. =====
create or replace function private.recompute_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lo_primary public.rel_type;
  lo_primary_former boolean;
begin
  if new.lo_answered_at is not null and new.hi_answered_at is not null and new.status = 'pending' then
    new.status := 'confirmed';
    new.confirmed_at := now();
  end if;
  if new.status = 'confirmed' then
    select category, is_former into lo_primary, lo_primary_former
      from public.connection_categories
      where connection_id = new.id and side = 'lo' and is_primary
      limit 1;
    new.eff_type := lo_primary;
    new.eff_is_former := coalesce(lo_primary_former, false);
    new.eff_years := least(new.lo_years, new.hi_years);
    new.eff_strength := least(new.lo_strength, new.hi_strength);
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ===== upsert_connection_answer: category rows for "this side" are
-- always written before this side's answered_at is set, so that by the
-- time the second side answers (the update that flips status to
-- confirmed), the recompute trigger above can see both sides' primaries. =====
create or replace function private.upsert_connection_answer(
  p_caller uuid,
  p_other uuid,
  p_categories jsonb,
  p_years int,
  p_strength int,
  p_source text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lo uuid;
  hi uuid;
  is_lo boolean;
  existing public.connections;
  conn_id uuid;
begin
  if p_caller < p_other then
    lo := p_caller; hi := p_other; is_lo := true;
  else
    lo := p_other; hi := p_caller; is_lo := false;
  end if;

  select * into existing from public.connections where user_lo = lo and user_hi = hi;

  if existing.id is not null then
    if (is_lo and existing.lo_answered_at is not null)
       or (not is_lo and existing.hi_answered_at is not null) then
      raise exception 'already_answered';
    end if;

    -- Write this side's categories first: the connections row already
    -- exists, and the other side's categories (if they've already
    -- answered) are already in place, so this order guarantees both
    -- sides' primaries are visible before the update below can flip
    -- status to confirmed.
    perform private.write_connection_categories(existing.id, case when is_lo then 'lo' else 'hi' end, p_categories);

    if is_lo then
      update public.connections set
        lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    else
      update public.connections set
        hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    end if;
  else
    -- Brand new connection: the row has to exist before category rows
    -- can reference it (FK), and status can't flip to confirmed off a
    -- single side answering anyway, so category data isn't needed yet
    -- for this insert's own trigger pass.
    if is_lo then
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, lo_years, lo_strength, lo_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_years, p_strength, now()
      ) returning id into conn_id;
    else
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, hi_years, hi_strength, hi_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_years, p_strength, now()
      ) returning id into conn_id;
    end if;

    perform private.write_connection_categories(conn_id, case when is_lo then 'lo' else 'hi' end, p_categories);
  end if;

  return conn_id;
end;
$$;

-- These three change parameter lists (single p_type/p_is_former ->
-- p_categories jsonb), which is a new overload as far as Postgres is
-- concerned, not a replacement -- drop the old signature explicitly so
-- it doesn't linger as a second, stale, still-callable RPC.
drop function if exists public.redeem_connect_token(text, public.rel_type, boolean, int, int);
drop function if exists public.answer_connection(uuid, public.rel_type, boolean, int, int);
drop function if exists public.request_connection(uuid, public.rel_type, boolean, int, int);

create or replace function public.redeem_connect_token(
  p_token text,
  p_categories jsonb,
  p_years int,
  p_strength int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  recent_count int;
  conn_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select ct.owner_id into owner from public.connect_tokens ct
    where ct.token = p_token and ct.expires_at > now();
  if owner is null then
    raise exception 'invalid_token';
  end if;

  if owner = uid then
    raise exception 'cannot_connect_self';
  end if;

  if private.is_blocked_between(uid, owner) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, owner, p_categories, p_years, p_strength, 'qr');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'qr'));

  return conn_id;
end;
$$;

create or replace function public.answer_connection(
  p_connection uuid,
  p_categories jsonb,
  p_years int,
  p_strength int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  conn public.connections;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into conn from public.connections where id = p_connection;
  if conn.id is null then
    raise exception 'not_found';
  end if;
  if uid <> conn.user_lo and uid <> conn.user_hi then
    raise exception 'not_participant';
  end if;

  if uid = conn.user_lo then
    if conn.lo_answered_at is not null then
      raise exception 'already_answered';
    end if;
    perform private.write_connection_categories(conn.id, 'lo', p_categories);
    update public.connections set
      lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
      where id = p_connection;
  else
    if conn.hi_answered_at is not null then
      raise exception 'already_answered';
    end if;
    perform private.write_connection_categories(conn.id, 'hi', p_categories);
    update public.connections set
      hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
      where id = p_connection;
  end if;
end;
$$;

create or replace function public.request_connection(
  p_other uuid,
  p_categories jsonb,
  p_years int,
  p_strength int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  recent_count int;
  conn_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_other = uid then
    raise exception 'cannot_connect_self';
  end if;

  if private.is_blocked_between(uid, p_other) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, p_other, p_categories, p_years, p_strength, 'roster_suggestion');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'roster_suggestion'));

  return conn_id;
end;
$$;

-- ===== my_connections: eff_type/eff_years/eff_is_former stay the single
-- display/color value (now sourced from categories, unchanged shape);
-- my_type/my_is_former are replaced with my_categories, an array
-- covering everything the caller themselves selected -- each entry
-- flagged confirmed (the other side also selected it) or not (private to
-- the caller). Never includes the other side's private-only categories. =====
drop function if exists public.my_connections();
create function public.my_connections()
returns table (
  other_id uuid,
  full_name text,
  eff_type public.rel_type,
  eff_years smallint,
  eff_is_former boolean,
  my_categories jsonb,
  my_years smallint,
  my_strength smallint,
  status public.conn_status
)
language sql stable security definer set search_path = '' as $$
  select
    case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end,
    p.full_name,
    c.eff_type,
    c.eff_years,
    c.eff_is_former,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', mine.category,
        'is_former', mine.is_former,
        'is_primary', mine.is_primary,
        'confirmed', exists (
          select 1 from public.connection_categories other_cc
          where other_cc.connection_id = c.id
            and other_cc.side <> mine.side
            and other_cc.category = mine.category
        )
      ) order by mine.is_primary desc, mine.category)
      from public.connection_categories mine
      where mine.connection_id = c.id
        and mine.side = (case when c.user_lo = (select auth.uid()) then 'lo' else 'hi' end)
    ), '[]'::jsonb),
    case when c.user_lo = (select auth.uid()) then c.lo_years else c.hi_years end,
    case when c.user_lo = (select auth.uid()) then c.lo_strength else c.hi_strength end,
    c.status
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
  where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
    and p.deleted_at is null
$$;

-- find_brokers is untouched: it reads connection_edges.eff_type, which
-- the existing sync_edges trigger (0002_graph_logic.sql) still copies
-- straight off connections.eff_type -- now sourced from categories
-- upstream, but the same single display value flows through unchanged.

-- ===== how_connected: same confirmed/private split as my_connections,
-- for the one connection between the caller and p_other. This is always
-- the caller's own view of their own connection -- never called on
-- someone else's behalf -- so it's fine for it to include the caller's
-- private-only categories too, same as "their own RPC call" in the spec. =====
drop function if exists public.how_connected(uuid);
create function public.how_connected(p_other uuid)
returns table (
  kind text,
  categories jsonb,
  years smallint,
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  conn public.connections;
  claim public.claimed_connections;
  mutuals int;
  my_side text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::int into mutuals from public.mutual_connections(p_other);

  select * into conn from public.connections
    where user_lo = least(uid, p_other) and user_hi = greatest(uid, p_other)
      and status = 'confirmed';

  if conn.id is not null then
    my_side := case when uid = conn.user_lo then 'lo' else 'hi' end;
    return query select
      'confirmed'::text,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', mine.category,
          'is_former', mine.is_former,
          'is_primary', mine.is_primary,
          'confirmed', exists (
            select 1 from public.connection_categories other_cc
            where other_cc.connection_id = conn.id
              and other_cc.side <> mine.side
              and other_cc.category = mine.category
          )
        ) order by mine.is_primary desc, mine.category)
        from public.connection_categories mine
        where mine.connection_id = conn.id and mine.side = my_side
      ), '[]'::jsonb),
      case when uid = conn.user_lo then conn.lo_years else conn.hi_years end,
      mutuals;
    return;
  end if;

  select * into claim from public.claimed_connections
    where claimant_id = uid and claimed_person_id = p_other
    order by created_at desc limit 1;

  if claim.id is not null then
    return query select
      'claimed'::text,
      jsonb_build_array(jsonb_build_object(
        'category', claim.category, 'is_former', claim.is_former,
        'is_primary', true, 'confirmed', false
      )),
      claim.years, mutuals;
    return;
  end if;

  return query select null::text, '[]'::jsonb, null::smallint, mutuals;
end;
$$;

-- ===== discover_search: "category" in the result is the caller's own
-- primary (their private view of how they know this person, same as
-- before -- never shown to anyone but the caller), and the p_category
-- filter now matches ANY of the caller's own selected categories, not
-- just their primary, so filtering by "Mentor" still surfaces someone
-- the caller also tagged Coworker-but-primary. =====
create or replace function public.discover_search(
  p_query text,
  p_category public.rel_type default null,
  p_min_mutual int default 0
)
returns table (
  id uuid,
  full_name text,
  headline text,
  employer text,
  city text,
  relationship_status text,
  category public.rel_type,
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('discover:' || uid::text, 60, interval '1 minute');

  return query
    with base as (
      select
        p.id, p.full_name, p.headline, p.employer, p.city,
        c.status as conn_status,
        case when c.user_lo = uid then c.lo_answered_at else c.hi_answered_at end as my_answered,
        case when c.user_lo = uid then c.hi_answered_at else c.lo_answered_at end as their_answered,
        (
          select cc.category from public.connection_categories cc
          where cc.connection_id = c.id
            and cc.side = (case when c.user_lo = uid then 'lo' else 'hi' end)
            and cc.is_primary
        ) as my_primary_category,
        exists (
          select 1 from public.connection_categories cc
          where cc.connection_id = c.id
            and cc.side = (case when c.user_lo = uid then 'lo' else 'hi' end)
            and cc.category = p_category
        ) as my_category_match,
        cc.category as claimed_category,
        (select count(*)::int from public.mutual_connections(p.id)) as mutual_count
      from public.profiles p
      left join public.memberships m
        on m.user_id = p.id and m.status = 'active' and m.org_id in (select private.my_org_ids())
      left join public.connections c
        on c.user_lo = least(uid, p.id) and c.user_hi = greatest(uid, p.id)
      left join lateral (
        select cc2.category from public.claimed_connections cc2
        where cc2.claimant_id = uid and cc2.claimed_person_id = p.id
        order by cc2.created_at desc limit 1
      ) cc on true
      where (m.user_id is not null or p.is_public)
        and p.id <> uid
        and p.deleted_at is null
        and not private.is_blocked_between(uid, p.id)
        and (
          p.full_name ilike '%' || p_query || '%'
          or p.employer ilike '%' || p_query || '%'
          or p.city ilike '%' || p_query || '%'
        )
    ),
    with_status as (
      select
        b.id, b.full_name, b.headline, b.employer, b.city,
        case
          when b.conn_status = 'confirmed' then 'confirmed'
          when b.my_answered is not null and b.their_answered is null then 'pending_sent'
          when b.my_answered is null and b.their_answered is not null then 'pending_received'
          when b.claimed_category is not null then 'claimed'
          else 'none'
        end as relationship_status,
        coalesce(b.my_primary_category, b.claimed_category) as category,
        (p_category is null or b.my_category_match or b.claimed_category = p_category) as category_match,
        b.mutual_count
      from base b
    )
    select w.id, w.full_name, w.headline, w.employer, w.city,
           w.relationship_status, w.category, w.mutual_count
    from with_status w
    where w.category_match
      and w.mutual_count >= p_min_mutual
    order by w.mutual_count desc, w.full_name
    limit 20;
end;
$$;

create or replace function public.company_members(p_employer text)
returns table (
  id uuid,
  full_name text,
  headline text,
  city text,
  relationship_status text,
  category public.rel_type,
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('company:' || uid::text, 60, interval '1 minute');

  return query
    with base as (
      select
        p.id, p.full_name, p.headline, p.city,
        c.status as conn_status,
        case when c.user_lo = uid then c.lo_answered_at else c.hi_answered_at end as my_answered,
        case when c.user_lo = uid then c.hi_answered_at else c.lo_answered_at end as their_answered,
        (
          select cc.category from public.connection_categories cc
          where cc.connection_id = c.id
            and cc.side = (case when c.user_lo = uid then 'lo' else 'hi' end)
            and cc.is_primary
        ) as my_primary_category,
        cc2.category as claimed_category,
        (select count(*)::int from public.mutual_connections(p.id)) as mutual_count
      from public.profiles p
      left join public.memberships m
        on m.user_id = p.id and m.status = 'active' and m.org_id in (select private.my_org_ids())
      left join public.connections c
        on c.user_lo = least(uid, p.id) and c.user_hi = greatest(uid, p.id)
      left join lateral (
        select cc2b.category from public.claimed_connections cc2b
        where cc2b.claimant_id = uid and cc2b.claimed_person_id = p.id
        order by cc2b.created_at desc limit 1
      ) cc2 on true
      where (m.user_id is not null or p.is_public)
        and p.id <> uid
        and p.deleted_at is null
        and lower(p.employer) = lower(p_employer)
        and not private.is_blocked_between(uid, p.id)
    )
    select
      b.id, b.full_name, b.headline, b.city,
      case
        when b.conn_status = 'confirmed' then 'confirmed'
        when b.my_answered is not null and b.their_answered is null then 'pending_sent'
        when b.my_answered is null and b.their_answered is not null then 'pending_received'
        when b.claimed_category is not null then 'claimed'
        else 'none'
      end as relationship_status,
      coalesce(b.my_primary_category, b.claimed_category) as category,
      b.mutual_count
    from base b
    order by b.mutual_count desc, b.full_name
    limit 50;
end;
$$;

-- Now safe to drop: every function above that used to reference these
-- columns has been redefined to read connection_categories instead.
alter table public.connections
  drop column lo_type,
  drop column hi_type,
  drop column lo_is_former,
  drop column hi_is_former;

revoke all on function public.redeem_connect_token(text, jsonb, int, int) from public, anon, authenticated;
revoke all on function public.answer_connection(uuid, jsonb, int, int) from public, anon, authenticated;
revoke all on function public.request_connection(uuid, jsonb, int, int) from public, anon, authenticated;
revoke all on function public.my_connections() from public, anon, authenticated;
revoke all on function public.how_connected(uuid) from public, anon, authenticated;
revoke all on function public.discover_search(text, public.rel_type, int) from public, anon, authenticated;
revoke all on function public.company_members(text) from public, anon, authenticated;

grant execute on function public.redeem_connect_token(text, jsonb, int, int) to authenticated;
grant execute on function public.answer_connection(uuid, jsonb, int, int) to authenticated;
grant execute on function public.request_connection(uuid, jsonb, int, int) to authenticated;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.how_connected(uuid) to authenticated;
grant execute on function public.discover_search(text, public.rel_type, int) to authenticated;
grant execute on function public.company_members(text) to authenticated;
