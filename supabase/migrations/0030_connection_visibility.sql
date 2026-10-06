-- ===== Per-connection visibility + the extended-network orb =====
-- Replaces 0029's "both profiles public" rule. Visibility is now a
-- choice each person makes about each connection, asked at the moment
-- they connect (QR answer, connection request, confirming a pending
-- request) and changeable later from the network list.
--
--   * Each side has its own flag (lo_public / hi_public).
--   * A connection is shown to other people only when BOTH sides chose
--     public. Either side choosing private keeps it private -- a
--     connection is a fact about two people, so the more private choice
--     wins.
--   * null = never asked. Every connection that existed before this
--     migration starts private; nobody consented to showing it.
--   * You always see your own connections, whatever their visibility.
--
-- public_graph() now walks outward from the caller: your connections,
-- their public connections, those people's public connections, and so
-- on, up to 6 hops and 1500 edges. Profile is_public no longer plays a
-- part here (it still controls Discover/search).

alter table public.connections
  add column lo_public boolean,
  add column hi_public boolean;

-- ===== set_connection_visibility: the caller sets THEIR side only =====
create function public.set_connection_visibility(p_connection uuid, p_public boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  c public.connections;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_public is null then
    raise exception 'invalid_visibility';
  end if;

  select * into c from public.connections where id = p_connection;
  if not found then
    raise exception 'not_found';
  end if;

  if c.user_lo = uid then
    update public.connections set lo_public = p_public where id = p_connection;
  elsif c.user_hi = uid then
    update public.connections set hi_public = p_public where id = p_connection;
  else
    raise exception 'not_participant';
  end if;
end;
$$;

-- ===== my_connection_visibility: the caller's own choice per connection,
-- for the toggle on the network list. Deliberately does not return the
-- other person's choice. =====
create function public.my_connection_visibility()
returns table (connection_id uuid, other_id uuid, my_public boolean)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end,
    coalesce(case when c.user_lo = (select auth.uid()) then c.lo_public else c.hi_public end, false)
  from public.connections c
  where c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid())
$$;

-- ===== public_graph: extended network, walked outward from the caller =====
drop function if exists public.public_graph();
create function public.public_graph()
returns table (
  src_id uuid,
  src_name text,
  src_avatar_url text,
  dst_id uuid,
  dst_name text,
  dst_avatar_url text,
  shared_type public.rel_type,
  is_former boolean,
  involves_me boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('public_graph:' || uid::text, 30, interval '1 minute');

  return query
    with recursive
    -- Every edge this caller may see: confirmed, both people present and
    -- not blocked with the caller, and either public on both sides or
    -- one of the caller's own.
    visible as (
      select c.id, c.user_lo, c.user_hi
      from public.connections c
      join public.profiles lo on lo.id = c.user_lo and lo.deleted_at is null
      join public.profiles hi on hi.id = c.user_hi and hi.deleted_at is null
      where c.status = 'confirmed'
        and (
          (coalesce(c.lo_public, false) and coalesce(c.hi_public, false))
          or c.user_lo = uid
          or c.user_hi = uid
        )
        and not private.is_blocked_between(uid, c.user_lo)
        and not private.is_blocked_between(uid, c.user_hi)
    ),
    adj as (
      select v.user_lo as a, v.user_hi as b from visible v
      union all
      select v.user_hi, v.user_lo from visible v
    ),
    -- Breadth-first walk out from the caller. union (not union all)
    -- dedupes (node, depth) pairs; the depth cap bounds the walk.
    reach (node, depth) as (
      select uid, 0
      union
      select adj.b, r.depth + 1
      from reach r
      join adj on adj.a = r.node
      where r.depth < 6
    ),
    nodes as (
      select distinct node from reach
    )
    select
      lo.id, lo.full_name, lo.avatar_url,
      hi.id, hi.full_name, hi.avatar_url,
      shared.category,
      coalesce(shared.is_former, false),
      (v.user_lo = uid or v.user_hi = uid)
    from visible v
    join nodes n1 on n1.node = v.user_lo
    join nodes n2 on n2.node = v.user_hi
    join public.profiles lo on lo.id = v.user_lo
    join public.profiles hi on hi.id = v.user_hi
    -- Color only by a category BOTH sides picked; connections.eff_type
    -- is one side's private label (see 0029).
    left join lateral (
      select cl.category, (cl.is_former and ch.is_former) as is_former
      from public.connection_categories cl
      join public.connection_categories ch
        on ch.connection_id = cl.connection_id
       and ch.side = 'hi'
       and ch.category = cl.category
      where cl.connection_id = v.id
        and cl.side = 'lo'
      order by cl.is_primary desc, ch.is_primary desc, cl.category
      limit 1
    ) shared on true
    order by (v.user_lo = uid or v.user_hi = uid) desc
    limit 1500;
end;
$$;

revoke all on function public.set_connection_visibility(uuid, boolean) from public, anon, authenticated;
revoke all on function public.my_connection_visibility() from public, anon, authenticated;
revoke all on function public.public_graph() from public, anon, authenticated;

grant execute on function public.set_connection_visibility(uuid, boolean) to authenticated;
grant execute on function public.my_connection_visibility() to authenticated;
grant execute on function public.public_graph() to authenticated;
