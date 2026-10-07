-- ===== Explore search with filters =====
-- discover_people() = discover_search() (0028) plus filters on the
-- onboarding fields from 0033: school, industry, city, graduation year,
-- students only. Same visibility rule (shared org, public profile, or a
-- confirmed connection), same block/deleted exclusions, same rate limit.
-- With a filter set, the text query can be empty ("everyone from Baylor").
-- Text now also matches headline, job title and school.

create function public.discover_people(
  p_query text default '',
  p_category public.rel_type default null,
  p_min_mutual int default 0,
  p_school uuid default null,
  p_industry text default null,
  p_city text default null,
  p_grad_year int default null,
  p_students_only boolean default false
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  employer text,
  city text,
  school_name text,
  relationship_status text,
  category public.rel_type,
  mutual_count int,
  is_new boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  q text := trim(coalesce(p_query, ''));
  has_filter boolean := p_school is not null or nullif(trim(p_industry), '') is not null
    or nullif(trim(p_city), '') is not null or p_grad_year is not null or coalesce(p_students_only, false)
    or p_category is not null;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(q) < 2 and not has_filter then
    return;
  end if;

  perform private.check_rate_limit('discover:' || uid::text, 60, interval '1 minute');

  return query
    with base as (
      select
        p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city, p.school_name,
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
        claimed.category as claimed_category,
        (select count(*)::int from public.mutual_connections(p.id)) as mutual_count
      from public.profiles p
      left join public.connections c
        on c.user_lo = least(uid, p.id) and c.user_hi = greatest(uid, p.id)
      left join lateral (
        select cc2.category from public.claimed_connections cc2
        where cc2.claimant_id = uid and cc2.claimed_person_id = p.id
        order by cc2.created_at desc limit 1
      ) claimed on true
      where (
          p.is_public
          or private.has_confirmed_connection(p.id)
          or exists (
            select 1 from public.memberships m
            where m.user_id = p.id and m.status = 'active'
              and m.org_id in (select private.my_org_ids())
          )
        )
        and p.id <> uid
        and p.deleted_at is null
        and not private.is_blocked_between(uid, p.id)
        and (
          char_length(q) < 2
          or p.full_name ilike '%' || q || '%'
          or p.employer ilike '%' || q || '%'
          or p.city ilike '%' || q || '%'
          or p.headline ilike '%' || q || '%'
          or p.job_title ilike '%' || q || '%'
          or p.school_name ilike '%' || q || '%'
        )
        and (p_school is null or p.school_id = p_school)
        and (nullif(trim(p_industry), '') is null or p.industry = trim(p_industry))
        and (nullif(trim(p_city), '') is null or p.city ilike '%' || trim(p_city) || '%')
        and (p_grad_year is null or p.grad_year = p_grad_year)
        and (not coalesce(p_students_only, false) or p.status = 'student')
    ),
    with_status as (
      select
        b.*,
        case
          when b.conn_status = 'confirmed' then 'confirmed'
          when b.my_answered is not null and b.their_answered is null then 'pending_sent'
          when b.my_answered is null and b.their_answered is not null then 'pending_received'
          when b.claimed_category is not null then 'claimed'
          else 'none'
        end as rel_status,
        coalesce(b.my_primary_category, b.claimed_category) as cat,
        (p_category is null or b.my_category_match or b.claimed_category = p_category) as category_match
      from base b
    )
    select w.id, w.full_name, w.avatar_url, w.headline, w.employer, w.city, w.school_name,
           w.rel_status, w.cat, w.mutual_count, w.is_new
    from with_status w
    where w.category_match
      and w.mutual_count >= coalesce(p_min_mutual, 0)
    order by w.mutual_count desc, w.full_name
    limit 40;
end;
$$;

revoke all on function public.discover_people(text, public.rel_type, int, uuid, text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.discover_people(text, public.rel_type, int, uuid, text, text, int, boolean) to authenticated;
