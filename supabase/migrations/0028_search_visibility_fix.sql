-- ===== Phase 3 (UX overhaul): fix the Find/Search false-negative bug =====
-- Live-audit finding: Find's search misses direct connections. Root
-- cause: search_members (and discover_search/company_members, which the
-- merged Search page also uses) only ever matched people who share an
-- org with the caller, or who opted into a public profile --
-- profiles_select RLS has allowed a third case since 0012_profiles.sql
-- (a confirmed direct connection, with no shared org required -- Phase 2
-- of the original spec removed the org gate on connecting at all), but
-- these RPCs' own visibility filter never caught up. The result: you
-- could open someone's profile directly (RLS allowed it) but could not
-- find them by name in Find or Discover at all. This adds the same
-- private.has_confirmed_connection() check RLS already uses.

drop function if exists public.search_members(text);
create function public.search_members(q text)
returns table (id uuid, full_name text, avatar_url text, headline text, employer text, city text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('search:' || (select auth.uid())::text, 60, interval '1 minute');

  return query
    select p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city
    from public.profiles p
    left join public.memberships m
      on m.user_id = p.id and m.status = 'active' and m.org_id in (select private.my_org_ids())
    where (m.user_id is not null or p.is_public or private.has_confirmed_connection(p.id))
      and p.id <> (select auth.uid())
      and p.deleted_at is null
      and not private.is_blocked_between((select auth.uid()), p.id)
      and (
        p.full_name ilike '%' || q || '%'
        or p.employer ilike '%' || q || '%'
        or p.city ilike '%' || q || '%'
      )
    limit 20;
end;
$$;

drop function if exists public.discover_search(text, public.rel_type, int);
create function public.discover_search(
  p_query text,
  p_category public.rel_type default null,
  p_min_mutual int default 0
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  employer text,
  city text,
  relationship_status text,
  category public.rel_type,
  mutual_count int,
  is_new boolean
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
        p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city,
        p.created_at > now() - interval '7 days' as is_new,
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
      where (m.user_id is not null or p.is_public or private.has_confirmed_connection(p.id))
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
        b.id, b.full_name, b.avatar_url, b.headline, b.employer, b.city, b.is_new,
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
    select w.id, w.full_name, w.avatar_url, w.headline, w.employer, w.city,
           w.relationship_status, w.category, w.mutual_count, w.is_new
    from with_status w
    where w.category_match
      and w.mutual_count >= p_min_mutual
    order by w.mutual_count desc, w.full_name
    limit 20;
end;
$$;

drop function if exists public.company_members(text);
create function public.company_members(p_employer text)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  city text,
  relationship_status text,
  category public.rel_type,
  mutual_count int,
  is_new boolean
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
        p.id, p.full_name, p.avatar_url, p.headline, p.city,
        p.created_at > now() - interval '7 days' as is_new,
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
      where (m.user_id is not null or p.is_public or private.has_confirmed_connection(p.id))
        and p.id <> uid
        and p.deleted_at is null
        and lower(p.employer) = lower(p_employer)
        and not private.is_blocked_between(uid, p.id)
    )
    select
      b.id, b.full_name, b.avatar_url, b.headline, b.city,
      case
        when b.conn_status = 'confirmed' then 'confirmed'
        when b.my_answered is not null and b.their_answered is null then 'pending_sent'
        when b.my_answered is null and b.their_answered is not null then 'pending_received'
        when b.claimed_category is not null then 'claimed'
        else 'none'
      end as relationship_status,
      coalesce(b.my_primary_category, b.claimed_category) as category,
      b.mutual_count,
      b.is_new
    from base b
    order by b.mutual_count desc, b.full_name
    limit 50;
end;
$$;

revoke all on function public.search_members(text) from public, anon, authenticated;
revoke all on function public.discover_search(text, public.rel_type, int) from public, anon, authenticated;
revoke all on function public.company_members(text) from public, anon, authenticated;

grant execute on function public.search_members(text) to authenticated;
grant execute on function public.discover_search(text, public.rel_type, int) to authenticated;
grant execute on function public.company_members(text) to authenticated;
