-- ===== Interests, goals, interest-based suggestions, cold contacts =====
-- Onboarding now asks what people are into (interests) and what they
-- want from the network (goals), then suggests people to add.
--
-- "Cold contacts" are deliberately NOT connections. A connection is a
-- relationship both people independently verified (categories, years,
-- closeness), and it powers intro paths and the network orb. A cold
-- contact is a lightweight "let's be in touch" between people who don't
-- know each other yet: request -> accept/decline. It never creates a
-- connection_edges row, so it can't fake a broker path. Two contacts who
-- later actually know each other can confirm a real connection the
-- normal way.

-- ===== profile fields =====
alter table public.profiles
  add column interests text[] not null default '{}',
  add column goals text[] not null default '{}';

alter table public.profiles
  add constraint profiles_interests_size check (cardinality(interests) <= 20),
  add constraint profiles_goals_size check (cardinality(goals) <= 8);

-- ===== suggest_people: ranked by shared interests/goals =====
-- Same visibility rule as Discover: people who share an org with the
-- caller or have a public profile. Excludes the caller, existing
-- connections (any status), existing contact requests either way,
-- blocked and deleted profiles.
create function public.suggest_people(p_limit int default 24)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  headline text,
  employer text,
  city text,
  shared_interests text[],
  shared_goals text[],
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  my_interests text[];
  my_goals text[];
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('suggest_people:' || uid::text, 30, interval '1 minute');

  select p.interests, p.goals into my_interests, my_goals
    from public.profiles p where p.id = uid;

  return query
    with candidates as (
      select
        p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city,
        array(select unnest(p.interests) intersect select unnest(coalesce(my_interests, '{}'))) as si,
        array(select unnest(p.goals) intersect select unnest(coalesce(my_goals, '{}'))) as sg
      from public.profiles p
      where (
          p.is_public
          or exists (
            select 1 from public.memberships m
            where m.user_id = p.id and m.status = 'active'
              and m.org_id in (select private.my_org_ids())
          )
        )
        and p.id <> uid
        and p.deleted_at is null
        and not private.is_blocked_between(uid, p.id)
        and not exists (
          select 1 from public.connections c
          where c.user_lo = least(uid, p.id) and c.user_hi = greatest(uid, p.id)
        )
        and not exists (
          select 1 from public.contact_requests cr
          where (cr.requester_id = uid and cr.target_id = p.id)
             or (cr.requester_id = p.id and cr.target_id = uid)
        )
    ),
    ranked as (
      select c.*, (select count(*)::int from public.mutual_connections(c.id)) as mc
      from candidates c
    )
    select r.id, r.full_name, r.avatar_url, r.headline, r.employer, r.city, r.si, r.sg, r.mc
    from ranked r
    -- Shared interests weigh most, then shared goals, then mutuals;
    -- people with nothing in common still show up last ("cold" adds).
    order by cardinality(r.si) * 2 + cardinality(r.sg) desc, r.mc desc, r.full_name
    limit greatest(1, least(coalesce(p_limit, 24), 50));
end;
$$;

-- ===== contact_requests =====
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  note text check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> target_id),
  unique (requester_id, target_id)
);
create index contact_requests_target_idx on public.contact_requests(target_id, status);

-- RLS on, no policies: every read/write goes through the RPCs below,
-- same as connections.
alter table public.contact_requests enable row level security;

create function public.send_contact_request(p_target uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  req_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_target = uid then
    raise exception 'cannot_connect_self';
  end if;
  if private.is_blocked_between(uid, p_target) then
    raise exception 'blocked';
  end if;
  -- Cold outreach is where spam lives: tighter than connection requests.
  perform private.check_rate_limit('contact_request:' || uid::text, 25, interval '1 day');

  -- Only people you could find anyway (shared org, public profile, or
  -- an existing connection) -- no messaging arbitrary user ids.
  if not exists (
    select 1 from public.profiles p
    left join public.memberships m
      on m.user_id = p.id and m.status = 'active' and m.org_id in (select private.my_org_ids())
    where p.id = p_target and p.deleted_at is null
      and (m.user_id is not null or p.is_public or private.has_confirmed_connection(p.id))
  ) then
    raise exception 'not_found';
  end if;

  -- If they already asked you, sending one back accepts theirs.
  update public.contact_requests
     set status = 'accepted', responded_at = now()
   where requester_id = p_target and target_id = uid and status = 'pending'
   returning id into req_id;
  if req_id is not null then
    return req_id;
  end if;

  insert into public.contact_requests (requester_id, target_id, note)
    values (uid, p_target, nullif(trim(p_note), ''))
    on conflict (requester_id, target_id) do nothing
    returning id into req_id;

  return req_id;
end;
$$;

create function public.respond_contact_request(p_request uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  update public.contact_requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_request and target_id = uid and status = 'pending';
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- Incoming pending requests + accepted contacts, for the pending page and
-- the network list. Declined requests are never shown to the requester
-- as "declined" (they just stay pending from their side's view).
create function public.my_contacts()
returns table (
  request_id uuid,
  other_id uuid,
  full_name text,
  avatar_url text,
  headline text,
  note text,
  status text,
  incoming boolean,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    cr.id,
    p.id,
    p.full_name,
    p.avatar_url,
    p.headline,
    case when cr.target_id = (select auth.uid()) then cr.note end,
    case
      when cr.status = 'declined' and cr.requester_id = (select auth.uid()) then 'pending'
      else cr.status
    end,
    cr.target_id = (select auth.uid()),
    cr.created_at
  from public.contact_requests cr
  join public.profiles p
    on p.id = case when cr.requester_id = (select auth.uid()) then cr.target_id else cr.requester_id end
  where (cr.requester_id = (select auth.uid()) or cr.target_id = (select auth.uid()))
    and p.deleted_at is null
    and not (cr.status = 'declined' and cr.target_id = (select auth.uid()))
  order by cr.created_at desc
$$;

revoke all on function public.suggest_people(int) from public, anon, authenticated;
revoke all on function public.send_contact_request(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_contact_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.my_contacts() from public, anon, authenticated;

grant execute on function public.suggest_people(int) to authenticated;
grant execute on function public.send_contact_request(uuid, text) to authenticated;
grant execute on function public.respond_contact_request(uuid, boolean) to authenticated;
grant execute on function public.my_contacts() to authenticated;
