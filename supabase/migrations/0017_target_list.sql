-- ===== Target List / Pipeline (Phase 9, NEW FEATURE) =====
-- A private, per-user pipeline of people they want to reach -- existing
-- members or, mirroring claimed_connections/person_stubs, someone not on
-- Vouchline yet. No policies on the table: RPC-only, same pattern as
-- connections/connection_edges/claimed_connections.
create type public.target_stage as enum (
  'watching', 'reaching_out', 'intro_requested', 'connected', 'closed'
);

create table public.target_list_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_person_id uuid references public.profiles(id) on delete cascade,
  target_stub_id uuid references public.person_stubs(id) on delete cascade,
  stage public.target_stage not null default 'watching',
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_person_id is not null and target_stub_id is null)
    or (target_person_id is null and target_stub_id is not null)
  ),
  check (target_person_id is distinct from owner_id)
);

create unique index target_list_entries_owner_person_uidx
  on public.target_list_entries(owner_id, target_person_id) where target_person_id is not null;
create unique index target_list_entries_owner_stub_uidx
  on public.target_list_entries(owner_id, target_stub_id) where target_stub_id is not null;
create index target_list_entries_owner_idx on public.target_list_entries(owner_id);

alter table public.target_list_entries enable row level security;
-- no policies: RPC-only, matching connections/claimed_connections.

create or replace function public.add_target(p_person uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  entry_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_person = uid then
    raise exception 'cannot_target_self';
  end if;
  if not exists (select 1 from public.profiles where id = p_person and deleted_at is null) then
    raise exception 'not_found';
  end if;

  insert into public.target_list_entries (owner_id, target_person_id, note)
  values (uid, p_person, p_note)
  on conflict (owner_id, target_person_id) where target_person_id is not null
    do update set note = excluded.note, updated_at = now()
  returning id into entry_id;

  return entry_id;
end;
$$;

create or replace function public.add_target_stub(
  p_full_name text,
  p_linkedin_url text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  matched_person uuid;
  stub_id uuid;
  entry_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'invalid_name';
  end if;

  -- Resolve straight to a real account if the LinkedIn URL matches one
  -- already, same as claim_stub.
  if p_linkedin_url is not null then
    select id into matched_person from public.profiles
      where linkedin_url = p_linkedin_url and deleted_at is null limit 1;
  end if;

  if matched_person is not null then
    return public.add_target(matched_person, p_note);
  end if;

  if p_linkedin_url is not null then
    select id into stub_id from public.person_stubs where linkedin_url = p_linkedin_url;
  end if;

  if stub_id is null then
    insert into public.person_stubs (full_name, linkedin_url, created_by)
    values (trim(p_full_name), p_linkedin_url, uid)
    returning id into stub_id;
  end if;

  insert into public.target_list_entries (owner_id, target_stub_id, note)
  values (uid, stub_id, p_note)
  on conflict (owner_id, target_stub_id) where target_stub_id is not null
    do update set note = excluded.note, updated_at = now()
  returning id into entry_id;

  return entry_id;
end;
$$;

create or replace function public.set_target_stage(p_id uuid, p_stage public.target_stage)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.target_list_entries set stage = p_stage, updated_at = now()
    where id = p_id and owner_id = uid;

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.set_target_note(p_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.target_list_entries set note = p_note, updated_at = now()
    where id = p_id and owner_id = uid;

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.remove_target(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.target_list_entries where id = p_id and owner_id = uid;

  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create or replace function public.my_target_list()
returns table (
  id uuid,
  target_id uuid,
  full_name text,
  headline text,
  is_stub boolean,
  stage public.target_stage,
  note text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    t.id,
    coalesce(t.target_person_id, t.target_stub_id),
    coalesce(p.full_name, s.full_name),
    p.headline,
    t.target_stub_id is not null,
    t.stage,
    t.note,
    t.created_at
  from public.target_list_entries t
  left join public.profiles p on p.id = t.target_person_id and p.deleted_at is null
  left join public.person_stubs s on s.id = t.target_stub_id
  where t.owner_id = (select auth.uid())
  order by t.created_at desc
$$;

-- Extend the existing signup-merge trigger to also move a stub-based
-- target list entry onto the real account, same as claimed_connections.
create or replace function private.claim_stub_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_email public.citext;
  stub_ids uuid[];
begin
  select email into new_email from auth.users where id = new.id;

  select array_agg(id) into stub_ids from public.person_stubs
    where (new.linkedin_url is not null and linkedin_url = new.linkedin_url)
       or (new_email is not null and email = new_email);

  if stub_ids is not null then
    update public.claimed_connections
      set claimed_person_id = new.id, claimed_stub_id = null
      where claimed_stub_id = any(stub_ids)
        and claimant_id <> new.id;

    -- A target entry might already exist for the real account (someone
    -- both stub-targeted and separately targeted the now-signed-up
    -- person before they merged) -- drop the stub row rather than
    -- collide with the unique index in that case.
    delete from public.target_list_entries
      where target_stub_id = any(stub_ids)
        and owner_id in (
          select owner_id from public.target_list_entries
          where target_person_id = new.id
        );

    update public.target_list_entries
      set target_person_id = new.id, target_stub_id = null, updated_at = now()
      where target_stub_id = any(stub_ids)
        and owner_id <> new.id;

    delete from public.person_stubs where id = any(stub_ids);
  end if;

  return new;
end;
$$;

revoke all on function public.add_target(uuid, text) from public, anon, authenticated;
revoke all on function public.add_target_stub(text, text, text) from public, anon, authenticated;
revoke all on function public.set_target_stage(uuid, public.target_stage) from public, anon, authenticated;
revoke all on function public.set_target_note(uuid, text) from public, anon, authenticated;
revoke all on function public.remove_target(uuid) from public, anon, authenticated;
revoke all on function public.my_target_list() from public, anon, authenticated;

grant execute on function public.add_target(uuid, text) to authenticated;
grant execute on function public.add_target_stub(text, text, text) to authenticated;
grant execute on function public.set_target_stage(uuid, public.target_stage) to authenticated;
grant execute on function public.set_target_note(uuid, text) to authenticated;
grant execute on function public.remove_target(uuid) to authenticated;
grant execute on function public.my_target_list() to authenticated;
