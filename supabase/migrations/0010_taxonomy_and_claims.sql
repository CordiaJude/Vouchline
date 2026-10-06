-- ===== 10-category relationship taxonomy =====
-- Replaces the 5-value pilot taxonomy. 'pledge_brother' maps onto the new
-- 'org_member' category (closest semantic match); everything else passes
-- through by name. "Former" (boss/coworker) is now a boolean modifier
-- rather than a separate category.
create type public.rel_type_new as enum (
  'family','partner','best_friend','friend','mentor','boss','coworker','classmate','org_member','business_contact'
);

alter table public.connections
  alter column lo_type type public.rel_type_new using (
    case lo_type::text when 'pledge_brother' then 'org_member' else lo_type::text end
  )::public.rel_type_new,
  alter column hi_type type public.rel_type_new using (
    case hi_type::text when 'pledge_brother' then 'org_member' else hi_type::text end
  )::public.rel_type_new,
  alter column eff_type type public.rel_type_new using (
    case eff_type::text when 'pledge_brother' then 'org_member' else eff_type::text end
  )::public.rel_type_new;

-- connection_edges.eff_type also depends on the old type -- easy to miss
-- since it's a derived/denormalized copy, not the source of truth.
alter table public.connection_edges
  alter column eff_type type public.rel_type_new using (
    case eff_type::text when 'pledge_brother' then 'org_member' else eff_type::text end
  )::public.rel_type_new;

-- Drops every function with public.rel_type in its signature (see the
-- full list recreated below) along with the old type itself.
drop type public.rel_type cascade;
alter type public.rel_type_new rename to rel_type;

alter table public.connections
  add column lo_is_former boolean not null default false,
  add column hi_is_former boolean not null default false,
  add column eff_is_former boolean not null default false;

create or replace function private.recompute_connection() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lo_answered_at is not null and new.hi_answered_at is not null and new.status = 'pending' then
    new.status := 'confirmed';
    new.confirmed_at := now();
  end if;
  if new.status = 'confirmed' then
    new.eff_type := case when new.lo_type = new.hi_type then new.lo_type else null end;
    new.eff_years := least(new.lo_years, new.hi_years);
    new.eff_strength := least(new.lo_strength, new.hi_strength);
    new.eff_is_former := new.lo_is_former or new.hi_is_former;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ===== claims (one-sided, no confirmation) and person stubs =====
-- A stub holds a name (and optionally a LinkedIn URL) for someone who
-- isn't a Vouchline user yet and hasn't consented to appearing here --
-- flagged for legal review before this ships broadly (see PILOT_CHECKLIST
-- or equivalent). linkedin_url is unique so claiming the same person
-- twice from different accounts resolves to one stub, not duplicates.
create table public.person_stubs (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 80),
  linkedin_url text unique check (linkedin_url ~ '^https://(www\.)?linkedin\.com/'),
  email citext,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index person_stubs_email_idx on public.person_stubs(email) where email is not null;

create table public.claimed_connections (
  id uuid primary key default gen_random_uuid(),
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  claimed_person_id uuid references public.profiles(id) on delete cascade,
  claimed_stub_id uuid references public.person_stubs(id) on delete cascade,
  category public.rel_type not null,
  is_former boolean not null default false,
  years smallint check (years between 0 and 70),
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  check (
    (claimed_person_id is not null and claimed_stub_id is null)
    or (claimed_person_id is null and claimed_stub_id is not null)
  ),
  check (claimed_person_id is distinct from claimant_id)
);
create index claimed_connections_claimant_idx on public.claimed_connections(claimant_id);
create index claimed_connections_stub_idx on public.claimed_connections(claimed_stub_id) where claimed_stub_id is not null;

alter table public.person_stubs enable row level security;
alter table public.claimed_connections enable row level security;
-- No policies on either: RPC-only, same pattern as connections/connection_edges.

create or replace function public.claim_person(
  p_person uuid,
  p_category public.rel_type,
  p_is_former boolean,
  p_years int,
  p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  claim_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_person = uid then
    raise exception 'cannot_claim_self';
  end if;
  if not exists (select 1 from public.profiles where id = p_person and deleted_at is null) then
    raise exception 'not_found';
  end if;

  perform private.check_rate_limit('claim:' || uid::text, 30, interval '1 day');

  insert into public.claimed_connections (claimant_id, claimed_person_id, category, is_former, years, note)
  values (uid, p_person, p_category, p_is_former, p_years, p_note)
  returning id into claim_id;

  return claim_id;
end;
$$;

create or replace function public.claim_stub(
  p_full_name text,
  p_linkedin_url text,
  p_category public.rel_type,
  p_is_former boolean,
  p_years int,
  p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  existing_person uuid;
  stub_id uuid;
  claim_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('claim:' || uid::text, 30, interval '1 day');

  -- If this LinkedIn URL already belongs to a real account, claim that
  -- account directly instead of creating a phantom stub for them.
  if p_linkedin_url is not null then
    select id into existing_person from public.profiles
      where linkedin_url = p_linkedin_url and deleted_at is null;
    if existing_person is not null then
      return public.claim_person(existing_person, p_category, p_is_former, p_years, p_note);
    end if;
  end if;

  if p_linkedin_url is not null then
    insert into public.person_stubs (full_name, linkedin_url, created_by)
    values (p_full_name, p_linkedin_url, uid)
    on conflict (linkedin_url) do update set full_name = public.person_stubs.full_name
    returning id into stub_id;
  else
    insert into public.person_stubs (full_name, created_by)
    values (p_full_name, uid)
    returning id into stub_id;
  end if;

  insert into public.claimed_connections (claimant_id, claimed_stub_id, category, is_former, years, note)
  values (uid, stub_id, p_category, p_is_former, p_years, p_note)
  returning id into claim_id;

  return claim_id;
end;
$$;

create or replace function public.unclaim_connection(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.claimed_connections
    where id = p_id and claimant_id = (select auth.uid());
end;
$$;

create or replace function public.my_claimed_connections()
returns table (
  id uuid,
  claimed_person_id uuid,
  claimed_person_name text,
  claimed_stub_id uuid,
  claimed_stub_name text,
  category public.rel_type,
  is_former boolean,
  years smallint,
  note text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    cc.id, cc.claimed_person_id, p.full_name, cc.claimed_stub_id, s.full_name,
    cc.category, cc.is_former, cc.years, cc.note, cc.created_at
  from public.claimed_connections cc
  left join public.profiles p on p.id = cc.claimed_person_id and p.deleted_at is null
  left join public.person_stubs s on s.id = cc.claimed_stub_id
  where cc.claimant_id = (select auth.uid())
  order by cc.created_at desc
$$;

-- Fires when someone the app already has a stub for finally signs up:
-- reassigns every claim pointing at that stub onto the real profile and
-- removes the stub. Matches by LinkedIn URL or email; silent, no
-- notification to either the new user or the claimants.
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

    delete from public.person_stubs where id = any(stub_ids);
  end if;

  return new;
end;
$$;

create trigger profiles_claim_stub_on_signup
  after insert on public.profiles
  for each row execute function private.claim_stub_on_signup();

-- ===== connect RPCs: drop the org-membership gate, add is_former =====
-- Per the current spec's design principle: "No org-membership gate on
-- who can connect to whom; orgs are only for rosters, invites, admin,
-- and metrics." Every private.shares_org(...) check that used to gate
-- connecting/claiming/path-finding is removed below.
create or replace function private.upsert_connection_answer(
  p_caller uuid,
  p_other uuid,
  p_type public.rel_type,
  p_is_former boolean,
  p_years int,
  p_strength int,
  p_source text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lo uuid;
  hi uuid;
  is_lo boolean;
  existing public.connections;
  conn_id uuid;
begin
  if p_caller < p_other then
    lo := p_caller; hi := p_other; is_lo := true;
  else
    lo := p_other; hi := p_caller; is_lo := false;
  end if;

  select * into existing from public.connections where user_lo = lo and user_hi = hi;

  if existing.id is not null then
    if (is_lo and existing.lo_answered_at is not null)
       or (not is_lo and existing.hi_answered_at is not null) then
      raise exception 'already_answered';
    end if;

    if is_lo then
      update public.connections set
        lo_type = p_type, lo_is_former = p_is_former, lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    else
      update public.connections set
        hi_type = p_type, hi_is_former = p_is_former, hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    end if;
  else
    if is_lo then
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, lo_type, lo_is_former, lo_years, lo_strength, lo_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_type, p_is_former, p_years, p_strength, now()
      ) returning id into conn_id;
    else
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, hi_type, hi_is_former, hi_years, hi_strength, hi_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_type, p_is_former, p_years, p_strength, now()
      ) returning id into conn_id;
    end if;
  end if;

  return conn_id;
end;
$$;

create or replace function public.redeem_connect_token(
  p_token text,
  p_type public.rel_type,
  p_is_former boolean,
  p_years int,
  p_strength int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  recent_count int;
  conn_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select ct.owner_id into owner from public.connect_tokens ct
    where ct.token = p_token and ct.expires_at > now();
  if owner is null then
    raise exception 'invalid_token';
  end if;

  if owner = uid then
    raise exception 'cannot_connect_self';
  end if;

  if private.is_blocked_between(uid, owner) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, owner, p_type, p_is_former, p_years, p_strength, 'qr');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'qr'));

  return conn_id;
end;
$$;

create or replace function public.answer_connection(
  p_connection uuid,
  p_type public.rel_type,
  p_is_former boolean,
  p_years int,
  p_strength int
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  conn public.connections;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into conn from public.connections where id = p_connection;
  if conn.id is null then
    raise exception 'not_found';
  end if;
  if uid <> conn.user_lo and uid <> conn.user_hi then
    raise exception 'not_participant';
  end if;

  if uid = conn.user_lo then
    if conn.lo_answered_at is not null then
      raise exception 'already_answered';
    end if;
    update public.connections set
      lo_type = p_type, lo_is_former = p_is_former, lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
      where id = p_connection;
  else
    if conn.hi_answered_at is not null then
      raise exception 'already_answered';
    end if;
    update public.connections set
      hi_type = p_type, hi_is_former = p_is_former, hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
      where id = p_connection;
  end if;
end;
$$;

create or replace function public.connect_token_preview(p_token text)
returns table (owner_id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select ct.owner_id into owner from public.connect_tokens ct
    where ct.token = p_token and ct.expires_at > now();
  if owner is null then
    raise exception 'invalid_token';
  end if;

  if owner = uid then
    raise exception 'cannot_connect_self';
  end if;

  return query select p.id, p.full_name from public.profiles p
    where p.id = owner and p.deleted_at is null;
end;
$$;

create or replace function public.create_sticker_token(p_owner uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  owner_sticker_mode boolean;
  recent_count int;
  new_token text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select sticker_mode into owner_sticker_mode from public.profiles
    where id = p_owner and deleted_at is null;
  if owner_sticker_mode is not true then
    raise exception 'sticker_mode_disabled';
  end if;

  delete from public.connect_tokens where owner_id = p_owner and expires_at < now();

  select count(*) into recent_count from public.connect_tokens
    where owner_id = p_owner and created_at > now() - interval '1 hour';
  if recent_count >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.connect_tokens (owner_id) values (p_owner)
    returning token into new_token;

  return new_token;
end;
$$;

create or replace function public.request_connection(
  p_other uuid,
  p_type public.rel_type,
  p_is_former boolean,
  p_years int,
  p_strength int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  recent_count int;
  conn_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_other = uid then
    raise exception 'cannot_connect_self';
  end if;

  if private.is_blocked_between(uid, p_other) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, p_other, p_type, p_is_former, p_years, p_strength, 'roster_suggestion');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'roster_suggestion'));

  return conn_id;
end;
$$;

create or replace function public.my_connections()
returns table (
  other_id uuid,
  full_name text,
  eff_type public.rel_type,
  eff_years smallint,
  eff_is_former boolean,
  my_type public.rel_type,
  my_is_former boolean,
  my_years smallint,
  my_strength smallint,
  status public.conn_status
)
language sql stable security definer set search_path = '' as $$
  select
    case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end,
    p.full_name,
    c.eff_type,
    c.eff_years,
    c.eff_is_former,
    case when c.user_lo = (select auth.uid()) then c.lo_type else c.hi_type end,
    case when c.user_lo = (select auth.uid()) then c.lo_is_former else c.hi_is_former end,
    case when c.user_lo = (select auth.uid()) then c.lo_years else c.hi_years end,
    case when c.user_lo = (select auth.uid()) then c.lo_strength else c.hi_strength end,
    c.status
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
  where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
    and p.deleted_at is null
$$;

-- find_brokers no longer requires the target to share an org with the
-- caller -- a confirmed connection outside any shared org is now a
-- perfectly valid bridge, and gating it here would silently hide it.
create or replace function public.find_brokers(p_target uuid)
returns table (broker_id uuid, broker_name text, broker_headline text, my_rel public.rel_type, their_rel public.rel_type, rank int)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id)
  select p.id, p.full_name, p.headline, e1.eff_type, e2.eff_type,
         (row_number() over (order by least(e1.eff_strength, e2.eff_strength) desc,
                                       (e1.eff_strength + e2.eff_strength) desc,
                                       p.full_name))::int
  from me
  join public.connection_edges e1 on e1.src = me.id
  join public.connection_edges e2 on e2.src = e1.dst and e2.dst = p_target
  join public.profiles p on p.id = e1.dst and p.deleted_at is null
  where p_target <> me.id
    and not private.is_blocked_between(me.id, p_target)
    and not private.is_blocked_between(me.id, e1.dst)
    and not exists (select 1 from public.connection_edges d where d.src = me.id and d.dst = p_target)
  order by 6
  limit 10
$$;

-- Every function above was either dropped by the CASCADE (rel_type in
-- its signature) or is brand new, so each one needs its anon/authenticated
-- grants re-asserted explicitly -- see 0008_security.sql's "grant audit
-- fix" for why revoking from public alone is not enough.
revoke all on function public.redeem_connect_token(text, public.rel_type, boolean, int, int) from public, anon, authenticated;
revoke all on function public.answer_connection(uuid, public.rel_type, boolean, int, int) from public, anon, authenticated;
revoke all on function public.my_connections() from public, anon, authenticated;
revoke all on function public.request_connection(uuid, public.rel_type, boolean, int, int) from public, anon, authenticated;
revoke all on function public.find_brokers(uuid) from public, anon, authenticated;
revoke all on function public.claim_person(uuid, public.rel_type, boolean, int, text) from public, anon, authenticated;
revoke all on function public.claim_stub(text, text, public.rel_type, boolean, int, text) from public, anon, authenticated;
revoke all on function public.unclaim_connection(uuid) from public, anon, authenticated;
revoke all on function public.my_claimed_connections() from public, anon, authenticated;

grant execute on function public.redeem_connect_token(text, public.rel_type, boolean, int, int) to authenticated;
grant execute on function public.answer_connection(uuid, public.rel_type, boolean, int, int) to authenticated;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.request_connection(uuid, public.rel_type, boolean, int, int) to authenticated;
grant execute on function public.find_brokers(uuid) to authenticated;
grant execute on function public.claim_person(uuid, public.rel_type, boolean, int, text) to authenticated;
grant execute on function public.claim_stub(text, text, public.rel_type, boolean, int, text) to authenticated;
grant execute on function public.unclaim_connection(uuid) to authenticated;
grant execute on function public.my_claimed_connections() to authenticated;
