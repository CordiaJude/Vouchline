-- ===== Richer onboarding: what you do, where you went to school =====
-- Onboarding now asks (modeled on LinkedIn's "Are you a student?" fork,
-- Handshake's school/major/grad-year, and Lunchclub's objectives):
--   status       student | working | founder | looking | other
--   students     school (from a real college list), major, expected grad year
--   everyone     job title + company + industry (non-students),
--                optional alma mater + grad year (alumni ties drive warm intros)
-- Every field feeds something: search, suggestions ("You both went to X"),
-- or the auto-written headline.

-- ===== colleges: U.S. degree-granting institutions =====
-- Seeded from the U.S. Department of Education College Scorecard
-- (public domain) by scripts/build-colleges-seed.mjs -> supabase/seed/colleges.sql.
create table public.colleges (
  id uuid primary key default gen_random_uuid(),
  unitid int unique,               -- IPEDS id; null for manually added rows
  name text not null check (char_length(name) between 2 and 160),
  city text,
  state text check (char_length(state) <= 2)
);
create index colleges_name_lower_idx on public.colleges (lower(name) text_pattern_ops);

-- Public reference data: any signed-in user may read it.
alter table public.colleges enable row level security;
create policy colleges_select on public.colleges for select to authenticated using (true);

-- Typeahead: prefix matches first, then word matches anywhere, then
-- shorter names. "ut austin" style abbreviations are not handled -- people
-- type the real name ("Texas at Austin").
create function public.search_colleges(q text)
returns table (id uuid, name text, city text, state text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.city, c.state
  from public.colleges c
  where char_length(trim(q)) >= 2
    and c.name ilike '%' || trim(q) || '%'
  order by
    -- "university of texas" should rank "The University of Texas at
    -- Austin" first, so a leading "The " doesn't count.
    (regexp_replace(lower(c.name), '^the ', '') like lower(trim(q)) || '%') desc,
    (lower(c.name) like '% ' || lower(trim(q)) || '%') desc,
    char_length(c.name),
    c.name
  limit 15
$$;

-- ===== profile fields =====
alter table public.profiles
  add column status text check (status in ('student', 'working', 'founder', 'looking', 'other')),
  add column job_title text check (char_length(job_title) <= 80),
  add column industry text check (char_length(industry) <= 60),
  add column school_id uuid references public.colleges(id) on delete set null,
  -- Display name for the school; also holds "not listed" schools typed by hand.
  add column school_name text check (char_length(school_name) <= 160),
  add column major text check (char_length(major) <= 80);

create index profiles_school_idx on public.profiles (school_id) where school_id is not null;

-- ===== suggest_people: add shared school and industry =====
-- Same visibility and exclusions as 0031; ranking now also rewards going
-- to the same school (strongest real-world tie) and sharing an industry.
drop function if exists public.suggest_people(int);
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
  mutual_count int,
  same_school text,
  same_industry text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('suggest_people:' || uid::text, 30, interval '1 minute');

  select * into me from public.profiles p where p.id = uid;

  return query
    with candidates as (
      select
        p.id, p.full_name, p.avatar_url, p.headline, p.employer, p.city,
        array(select unnest(p.interests) intersect select unnest(coalesce(me.interests, '{}'))) as si,
        array(select unnest(p.goals) intersect select unnest(coalesce(me.goals, '{}'))) as sg,
        case when me.school_id is not null and p.school_id = me.school_id then p.school_name end as ss,
        case when me.industry is not null and p.industry = me.industry then p.industry end as sind
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
    select r.id, r.full_name, r.avatar_url, r.headline, r.employer, r.city, r.si, r.sg, r.mc, r.ss, r.sind
    from ranked r
    order by
      (case when r.ss is not null then 4 else 0 end)
      + (case when r.sind is not null then 1 else 0 end)
      + cardinality(r.si) * 2 + cardinality(r.sg) desc,
      r.mc desc,
      r.full_name
    limit greatest(1, least(coalesce(p_limit, 24), 50));
end;
$$;

revoke all on function public.search_colleges(text) from public, anon, authenticated;
revoke all on function public.suggest_people(int) from public, anon, authenticated;
grant execute on function public.search_colleges(text) to authenticated;
grant execute on function public.suggest_people(int) to authenticated;
