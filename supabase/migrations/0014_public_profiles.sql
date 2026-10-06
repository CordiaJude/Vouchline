-- ===== Public / private profiles =====
-- New user-facing setting: a public profile is discoverable and
-- connectable by anyone, not just people who share an org. Default
-- false, matching the app's existing org-scoped Discover behavior for
-- everyone who doesn't opt in.
alter table public.profiles
  add column is_public boolean not null default false;

-- profiles_select: add "or is_public" alongside the existing self /
-- shared-org / confirmed-connection cases from 0012_profiles.sql. A
-- public profile needs to actually be viewable (e.g. /app/u/[id]) by a
-- stranger who found it via Discover, not just returned by the RPC.
alter policy profiles_select on public.profiles
  using (
    deleted_at is null
    and (
      id = (select auth.uid())
      or private.shares_org(id)
      or private.has_confirmed_connection(id)
      or is_public
    )
  );

-- discover_search: a result now qualifies if it shares an org with the
-- caller (unchanged) OR the profile is public, regardless of org.
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
        case when c.status = 'confirmed'
          then (case when c.user_lo = uid then c.lo_type else c.hi_type end)
        end as confirmed_category,
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
        coalesce(b.confirmed_category, b.claimed_category) as category,
        b.mutual_count
      from base b
    )
    select w.id, w.full_name, w.headline, w.employer, w.city,
           w.relationship_status, w.category, w.mutual_count
    from with_status w
    where (p_category is null or w.category = p_category)
      and w.mutual_count >= p_min_mutual
    order by w.mutual_count desc, w.full_name
    limit 20;
end;
$$;

revoke all on function public.discover_search(text, public.rel_type, int) from public, anon, authenticated;
grant execute on function public.discover_search(text, public.rel_type, int) to authenticated;
