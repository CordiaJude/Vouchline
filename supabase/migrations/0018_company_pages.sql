-- ===== Company Pages (Phase 10, NEW FEATURE) =====
-- Browsable by employer (free-text field -- exact case-insensitive match
-- only; fragmentation across spellings is an accepted pilot limitation,
-- same call as Phase 2's risk note on the employer field). Visibility
-- mirrors discover_search: a profile qualifies if it shares an org with
-- the caller or is public, and blocked users/self/deleted profiles are
-- always excluded.
create or replace function public.list_companies()
returns table (employer text, member_count int)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id),
  visible as (
    select p.id, p.employer
    from public.profiles p
    left join public.memberships m
      on m.user_id = p.id and m.status = 'active' and m.org_id in (select private.my_org_ids())
    cross join me
    where (m.user_id is not null or p.is_public)
      and p.id <> me.id
      and p.deleted_at is null
      and p.employer is not null
      and p.employer <> ''
      and not private.is_blocked_between(me.id, p.id)
  )
  select min(employer) as employer, count(*)::int as member_count
  from visible
  group by lower(employer)
  order by count(*) desc, min(employer)
  limit 100
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
      coalesce(b.confirmed_category, b.claimed_category) as category,
      b.mutual_count
    from base b
    order by b.mutual_count desc, b.full_name
    limit 50;
end;
$$;

revoke all on function public.list_companies() from public, anon, authenticated;
revoke all on function public.company_members(text) from public, anon, authenticated;

grant execute on function public.list_companies() to authenticated;
grant execute on function public.company_members(text) to authenticated;
