-- ===== Phase 1 (UX overhaul): avatars everywhere =====
-- A live-audit finding: no photos anywhere in the app, which the audit
-- called the single root cause behind most of the rest of its findings.
-- This migration adds storage for a photo and threads avatar_url through
-- every RPC that already returns a person's name, so the frontend never
-- has to make a second round trip just to get a picture.

alter table public.profiles add column avatar_url text;

-- ===== Storage: a public "avatars" bucket, one object per user =====
-- Object key is always exactly the uploading user's own id (no
-- extension, no subfolder) -- re-uploading overwrites in place rather
-- than accumulating orphaned files, and RLS can check identity with a
-- single equality instead of parsing a folder path. Public read (avatars
-- aren't sensitive -- they're shown to anyone who could already see the
-- person's name), but only the owner may write their own object.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text);

-- ===== mutual_connections: mutual lists on profile pages =====
drop function if exists public.mutual_connections(uuid);
create function public.mutual_connections(p_other uuid)
returns table (id uuid, full_name text, headline text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.headline, p.avatar_url
  from public.connection_edges e1
  join public.connection_edges e2 on e2.dst = e1.dst and e2.src = p_other
  join public.profiles p on p.id = e1.dst and p.deleted_at is null
  where e1.src = (select auth.uid())
    and e1.dst <> (select auth.uid())
    and e1.dst <> p_other
    and not private.is_blocked_between((select auth.uid()), p.id)
$$;

-- ===== my_connections: network list cards + orb nodes =====
drop function if exists public.my_connections();
create function public.my_connections()
returns table (
  other_id uuid,
  full_name text,
  avatar_url text,
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
    p.avatar_url,
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

-- ===== discover_search / company_members: search results =====
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
      where (m.user_id is not null or p.is_public)
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

-- ===== find_brokers: Find-a-path chips =====
drop function if exists public.find_brokers(uuid);
create function public.find_brokers(p_target uuid)
returns table (
  broker_id uuid,
  broker_name text,
  broker_avatar_url text,
  broker_headline text,
  bridge_kind text,
  my_rel public.rel_type,
  their_rel public.rel_type,
  rank int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('find_brokers:' || (select auth.uid())::text, 60, interval '1 minute');

  return query
  with me as (select (select auth.uid()) as id),
  confirmed_bridges as (
    select
      p.id, p.full_name, p.avatar_url, p.headline, 'confirmed'::text as bridge_kind,
      e1.eff_type as my_rel, e2.eff_type as their_rel,
      least(e1.eff_strength, e2.eff_strength) as sort_strength,
      (e1.eff_strength + e2.eff_strength) as sort_sum
    from me
    join public.connection_edges e1 on e1.src = me.id
    join public.connection_edges e2 on e2.src = e1.dst and e2.dst = p_target
    join public.profiles p on p.id = e1.dst and p.deleted_at is null
    where p_target <> me.id
      and not private.is_blocked_between(me.id, p_target)
      and not private.is_blocked_between(me.id, e1.dst)
  ),
  claimed_bridges as (
    select
      p.id, p.full_name, p.avatar_url, p.headline, 'claimed'::text as bridge_kind,
      cc.category as my_rel, e2.eff_type as their_rel,
      null::int as sort_strength, null::int as sort_sum
    from me
    join public.claimed_connections cc
      on cc.claimant_id = me.id and cc.claimed_person_id is not null
    join public.connection_edges e2 on e2.src = cc.claimed_person_id and e2.dst = p_target
    join public.profiles p on p.id = cc.claimed_person_id and p.deleted_at is null
    where p_target <> me.id
      and not private.is_blocked_between(me.id, p_target)
      and not private.is_blocked_between(me.id, cc.claimed_person_id)
      and not exists (
        select 1 from public.connection_edges e1c
        where e1c.src = me.id and e1c.dst = cc.claimed_person_id
      )
  ),
  combined as (
    select *, 0 as kind_order from confirmed_bridges
    union all
    select *, 1 as kind_order from claimed_bridges
  )
  select
    c.id, c.full_name, c.avatar_url, c.headline, c.bridge_kind, c.my_rel, c.their_rel,
    (row_number() over (
      order by c.kind_order, c.sort_strength desc nulls last, c.sort_sum desc nulls last, c.full_name
    ))::int as rank
  from combined c
  where not exists (
    select 1 from public.connection_edges d
    where d.src = (select id from me) and d.dst = p_target
  )
  order by rank
  limit 10;
end;
$$;

-- ===== suggest_from_roster / search_members: Find-a-path fallbacks =====
drop function if exists public.suggest_from_roster();
create function public.suggest_from_roster()
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  pledge_class text,
  grad_year int
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, p.headline, p.pledge_class, p.grad_year
  from public.profiles p
  join public.memberships m on m.user_id = p.id and m.status = 'active'
  join public.profiles me on me.id = (select auth.uid())
  where m.org_id in (select private.my_org_ids())
    and p.id <> (select auth.uid())
    and p.deleted_at is null
    and not private.is_blocked_between((select auth.uid()), p.id)
    and (
      (me.pledge_class is not null and p.pledge_class = me.pledge_class)
      or (me.grad_year is not null and p.grad_year is not null and abs(p.grad_year - me.grad_year) <= 1)
    )
    and not exists (
      select 1 from public.connections c
      where c.user_lo = least(p.id, (select auth.uid()))
        and c.user_hi = greatest(p.id, (select auth.uid()))
    )
  limit 20
$$;

drop function if exists public.search_members(text);
create function public.search_members(q text)
returns table (id uuid, full_name text, avatar_url text, headline text, employer text, city text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('search:' || (select auth.uid())::text, 60, interval '1 minute');

  return query
    select p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city
    from public.profiles p
    join public.memberships m on m.user_id = p.id and m.status = 'active'
    where m.org_id in (select private.my_org_ids())
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

-- ===== employer_overlap_suggestions: Discover's "people you may know" =====
drop function if exists public.employer_overlap_suggestions();
create function public.employer_overlap_suggestions()
returns table (id uuid, full_name text, avatar_url text, headline text, employer text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, p.headline, p.employer
  from public.profiles p
  join public.memberships m on m.user_id = p.id and m.status = 'active'
  join public.profiles me on me.id = (select auth.uid())
  where m.org_id in (select private.my_org_ids())
    and p.id <> (select auth.uid())
    and p.deleted_at is null
    and not private.is_blocked_between((select auth.uid()), p.id)
    and me.employer is not null
    and p.employer = me.employer
    and not exists (
      select 1 from public.connection_edges e
        where e.src = (select auth.uid()) and e.dst = p.id
    )
  limit 20
$$;

-- ===== admin_list_members: admin member list =====
drop function if exists public.admin_list_members(uuid);
create function public.admin_list_members(p_org uuid)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  email text,
  role public.org_role,
  status text,
  joined_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  return query
    select p.id, p.full_name, p.avatar_url, u.email::text, m.role, m.status, m.created_at
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by m.created_at;
end;
$$;

-- ===== dashboard_reachable_sample: "people you can reach" =====
drop function if exists public.dashboard_reachable_sample();
create function public.dashboard_reachable_sample()
returns table (id uuid, full_name text, avatar_url text, headline text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, p.headline
  from public.profiles p
  where p.id in (
    select e2.dst from public.connection_edges e1
      join public.connection_edges e2 on e2.src = e1.dst
      where e1.src = (select auth.uid()) and e2.dst <> (select auth.uid())
  )
  and p.deleted_at is null
  and not exists (
    select 1 from public.connection_edges d
      where d.src = (select auth.uid()) and d.dst = p.id
  )
  and not private.is_blocked_between((select auth.uid()), p.id)
  order by random()
  limit 5
$$;

-- ===== my_activity_feed: dashboard activity rows =====
-- person_id is the single other party for connection_confirmed and
-- roster_join, and for intro_accepted whenever the viewer is the
-- requester or the target (the other named party). It's null only for
-- the broker's-eye view of intro_accepted, where the row names two
-- people, not one -- the UI falls back to a neutral icon there rather
-- than picking one of the two arbitrarily.
drop function if exists public.my_activity_feed();
create function public.my_activity_feed()
returns table (kind text, headline text, person_id uuid, avatar_url text, happened_at timestamptz)
language sql stable security definer set search_path = '' as $$
  (
    select 'connection_confirmed', p.full_name, p.id, p.avatar_url, c.confirmed_at
    from public.connections c
    join public.profiles p
      on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
    where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
      and c.status = 'confirmed'
      and p.deleted_at is null
  )
  union all
  (
    select
      'intro_accepted',
      case
        when i.requester_id = (select auth.uid()) then rt.full_name
        when i.target_id = (select auth.uid()) then rq.full_name
        else rq.full_name || ' & ' || rt.full_name
      end,
      case
        when i.requester_id = (select auth.uid()) then rt.id
        when i.target_id = (select auth.uid()) then rq.id
        else null
      end,
      case
        when i.requester_id = (select auth.uid()) then rt.avatar_url
        when i.target_id = (select auth.uid()) then rq.avatar_url
        else null
      end,
      i.target_responded_at
    from public.intro_requests i
    join public.profiles rq on rq.id = i.requester_id
    join public.profiles rt on rt.id = i.target_id
    where (i.requester_id = (select auth.uid()) or i.broker_id = (select auth.uid()) or i.target_id = (select auth.uid()))
      and i.status = 'accepted'
  )
  union all
  (
    select 'roster_join', p.full_name, p.id, p.avatar_url, e.created_at
    from public.events e
    join public.profiles p on p.id = e.user_id
    where e.name = 'onboarded'
      and e.user_id <> (select auth.uid())
      and e.org_id in (select private.my_org_ids())
  )
  order by 5 desc
  limit 20
$$;

revoke all on function public.employer_overlap_suggestions() from public, anon, authenticated;
revoke all on function public.mutual_connections(uuid) from public, anon, authenticated;
revoke all on function public.my_connections() from public, anon, authenticated;
revoke all on function public.discover_search(text, public.rel_type, int) from public, anon, authenticated;
revoke all on function public.company_members(text) from public, anon, authenticated;
revoke all on function public.find_brokers(uuid) from public, anon, authenticated;
revoke all on function public.suggest_from_roster() from public, anon, authenticated;
revoke all on function public.search_members(text) from public, anon, authenticated;
revoke all on function public.admin_list_members(uuid) from public, anon, authenticated;
revoke all on function public.dashboard_reachable_sample() from public, anon, authenticated;
revoke all on function public.my_activity_feed() from public, anon, authenticated;

grant execute on function public.employer_overlap_suggestions() to authenticated;
grant execute on function public.mutual_connections(uuid) to authenticated;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.discover_search(text, public.rel_type, int) to authenticated;
grant execute on function public.company_members(text) to authenticated;
grant execute on function public.find_brokers(uuid) to authenticated;
grant execute on function public.suggest_from_roster() to authenticated;
grant execute on function public.search_members(text) to authenticated;
grant execute on function public.admin_list_members(uuid) to authenticated;
grant execute on function public.dashboard_reachable_sample() to authenticated;
grant execute on function public.my_activity_feed() to authenticated;
