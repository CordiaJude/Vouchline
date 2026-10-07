-- ===== Work history, education history, skills =====
-- LinkedIn-style: any number of jobs and schools, each with years, plus a
-- short list of skills. Visible to anyone who can see the profile;
-- editable only by its owner (plain RLS -- no RPCs needed).

create table public.profile_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('work', 'education')),
  -- work: job title; education: degree (e.g. "B.B.A.")
  title text check (char_length(title) <= 100),
  -- work: company; education: school
  organization text not null check (char_length(organization) between 1 and 160),
  school_id uuid references public.colleges(id) on delete set null,
  -- education: major / field of study
  field text check (char_length(field) <= 100),
  start_year int check (start_year between 1940 and 2045),
  end_year int check (end_year between 1940 and 2050),   -- null = current
  description text check (char_length(description) <= 600),
  created_at timestamptz not null default now(),
  check (end_year is null or start_year is null or end_year >= start_year)
);
create index profile_experiences_user_idx on public.profile_experiences(user_id, kind);

alter table public.profile_experiences enable row level security;

create policy profile_experiences_select on public.profile_experiences for select to authenticated
  using (private.can_view_profile(user_id));
create policy profile_experiences_insert on public.profile_experiences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profile_experiences_update on public.profile_experiences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy profile_experiences_delete on public.profile_experiences for delete to authenticated
  using (user_id = (select auth.uid()));

-- Keep people from flooding a profile.
create or replace function private.limit_experiences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.profile_experiences where user_id = new.user_id) >= 30 then
    raise exception 'too_many_entries';
  end if;
  return new;
end;
$$;
create trigger profile_experiences_limit
  before insert on public.profile_experiences
  for each row execute function private.limit_experiences();

-- Seed history from what onboarding already collected (current job and
-- school), so existing profiles aren't empty.
insert into public.profile_experiences (user_id, kind, title, organization)
  select p.id, 'work', p.job_title, p.employer
  from public.profiles p
  where p.employer is not null and p.deleted_at is null;
insert into public.profile_experiences (user_id, kind, organization, school_id, field, end_year)
  select p.id, 'education', p.school_name, p.school_id, p.major, p.grad_year
  from public.profiles p
  where p.school_name is not null and p.deleted_at is null;

-- ----- skills -----
alter table public.profiles add column skills text[] not null default '{}';
alter table public.profiles add constraint profiles_skills_size check (cardinality(skills) <= 30);

notify pgrst, 'reload schema';
