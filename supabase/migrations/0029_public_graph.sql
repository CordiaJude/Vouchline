-- ===== Community orb: everyone's public connections =====
-- The network orb used to show only the caller's own star (me -> each
-- confirmed connection). This adds a shared "community" view: every
-- confirmed connection where BOTH people have opted into a public
-- profile is visible to every signed-in member. Both-sides-public is
-- deliberate -- a connection is a fact about two people, so one person
-- going public must never expose who a private person knows.
--
-- On top of that, the caller always sees their own confirmed edges
-- (even to private people) so "you" stay anchored in the picture -- the
-- caller already sees those exact edges in my_connections().
--
-- What is NOT returned:
--   * strength in any form (eff/lo/hi_strength) -- security.test.sql's
--     structural OUT-parameter check still covers this function.
--   * either side's private category choice. connections.eff_type is the
--     lo side's own primary (0022), i.e. one person's private label, so
--     it is not used here. Instead an edge is colored only by a category
--     BOTH sides independently picked; otherwise it comes back null and
--     renders neutral.
--   * anyone blocked with the caller, or soft-deleted profiles.
--
-- Capped at 1500 edges and rate-limited like the other browse RPCs.

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
    select
      lo.id, lo.full_name, lo.avatar_url,
      hi.id, hi.full_name, hi.avatar_url,
      shared.category,
      coalesce(shared.is_former, false),
      (c.user_lo = uid or c.user_hi = uid)
    from public.connections c
    join public.profiles lo on lo.id = c.user_lo
    join public.profiles hi on hi.id = c.user_hi
    left join lateral (
      select cl.category, (cl.is_former and ch.is_former) as is_former
      from public.connection_categories cl
      join public.connection_categories ch
        on ch.connection_id = cl.connection_id
       and ch.side = 'hi'
       and ch.category = cl.category
      where cl.connection_id = c.id
        and cl.side = 'lo'
      order by cl.is_primary desc, ch.is_primary desc, cl.category
      limit 1
    ) shared on true
    where c.status = 'confirmed'
      and lo.deleted_at is null
      and hi.deleted_at is null
      and (
        (lo.is_public and hi.is_public)
        or c.user_lo = uid
        or c.user_hi = uid
      )
      and not private.is_blocked_between(uid, c.user_lo)
      and not private.is_blocked_between(uid, c.user_hi)
    order by (c.user_lo = uid or c.user_hi = uid) desc, c.confirmed_at desc nulls last
    limit 1500;
end;
$$;

revoke all on function public.public_graph() from public, anon, authenticated;
grant execute on function public.public_graph() to authenticated;
