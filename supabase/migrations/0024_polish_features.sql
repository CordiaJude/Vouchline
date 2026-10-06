-- ===== Phase E: network-appropriate polish features =====
-- (2) shared-connections preview: no schema change, reuses the existing
-- mutual_connections() RPC client-side.
-- (3) "new here" badge: discover_search/company_members gain is_new,
-- true when the person's own account is less than 7 days old. A plain
-- signup-date fact, not sensitive the way strength/category are.
-- (5) "recently active" sort: my_connections() gains confirmed_at so
-- the network list can offer "most recently connected" alongside
-- alphabetical/category filtering, using data that already exists on
-- the connections row.

drop function if exists public.discover_search(text, public.rel_type, int);
create function public.discover_search(
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
        p.id, p.full_name, p.headline, p.employer, p.city,
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
        b.id, b.full_name, b.headline, b.employer, b.city, b.is_new,
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
        p.id, p.full_name, p.headline, p.city,
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
      b.mutual_count,
      b.is_new
    from base b
    order by b.mutual_count desc, b.full_name
    limit 50;
end;
$$;

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
  status public.conn_status,
  confirmed_at timestamptz
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
    c.status,
    c.confirmed_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
  where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
    and p.deleted_at is null
$$;

revoke all on function public.discover_search(text, public.rel_type, int) from public, anon, authenticated;
revoke all on function public.company_members(text) from public, anon, authenticated;
revoke all on function public.my_connections() from public, anon, authenticated;

grant execute on function public.discover_search(text, public.rel_type, int) to authenticated;
grant execute on function public.company_members(text) to authenticated;
grant execute on function public.my_connections() to authenticated;
