alter table public.profiles
  add column sticker_mode boolean not null default false;

-- ===== shared helper =====
-- Upserts the caller's side of a connection (lo/hi determined by uuid
-- ordering, matching the connections table's own convention), raising
-- already_answered if that side has already answered. Used by both the
-- QR/token flow and the roster-suggestion flow so the branching logic
-- lives in exactly one place.
create or replace function private.upsert_connection_answer(
  p_caller uuid,
  p_other uuid,
  p_type public.rel_type,
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
        lo_type = p_type, lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    else
      update public.connections set
        hi_type = p_type, hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
        where id = existing.id
        returning id into conn_id;
    end if;
  else
    if is_lo then
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, lo_type, lo_years, lo_strength, lo_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_type, p_years, p_strength, now()
      ) returning id into conn_id;
    else
      insert into public.connections (
        user_lo, user_hi, initiated_by, source, hi_type, hi_years, hi_strength, hi_answered_at
      ) values (
        lo, hi, p_caller, p_source, p_type, p_years, p_strength, now()
      ) returning id into conn_id;
    end if;
  end if;

  return conn_id;
end;
$$;

-- ===== token issuance =====
create or replace function public.create_connect_token() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  recent_count int;
  new_token text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from public.connect_tokens where owner_id = uid and expires_at < now();

  select count(*) into recent_count from public.connect_tokens
    where owner_id = uid and created_at > now() - interval '1 hour';
  if recent_count >= 20 then
    raise exception 'rate_limited';
  end if;

  insert into public.connect_tokens (owner_id) values (uid)
    returning token into new_token;

  return new_token;
end;
$$;

-- Sticker mode: a static NFC tag encodes /c/u/[userId] rather than a
-- token, so this mints a fresh short-lived token on each tap on the
-- owner's behalf. Anyone who shares an org with the owner can trigger
-- it (that's the point of a shared sticker); the owner must have opted
-- in via profiles.sticker_mode, and the same per-owner rate limit as
-- create_connect_token applies regardless of who's tapping.
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

  if not private.shares_org(p_owner) then
    raise exception 'not_shared_org';
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

-- Lets the /c/[token] page show "How do you know {name}?" before the
-- caller has answered anything, without granting direct SELECT on
-- connect_tokens (which stays owner-only per its RLS policy).
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

  if not private.shares_org(owner) then
    raise exception 'not_shared_org';
  end if;

  return query select p.id, p.full_name from public.profiles p
    where p.id = owner and p.deleted_at is null;
end;
$$;

create or replace function public.redeem_connect_token(
  p_token text,
  p_type public.rel_type,
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

  if not private.shares_org(owner) then
    raise exception 'not_shared_org';
  end if;

  if private.is_blocked_between(uid, owner) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, owner, p_type, p_years, p_strength, 'qr');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'qr'));

  return conn_id;
end;
$$;

create or replace function public.answer_connection(
  p_connection uuid,
  p_type public.rel_type,
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
      lo_type = p_type, lo_years = p_years, lo_strength = p_strength, lo_answered_at = now()
      where id = p_connection;
  else
    if conn.hi_answered_at is not null then
      raise exception 'already_answered';
    end if;
    update public.connections set
      hi_type = p_type, hi_years = p_years, hi_strength = p_strength, hi_answered_at = now()
      where id = p_connection;
  end if;
end;
$$;

create or replace function public.decline_connection(p_connection uuid) returns void
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

  update public.connections set status = 'rejected' where id = p_connection;
end;
$$;

-- Only the caller's own answers, plus the jointly-derived eff_type/years.
-- eff_strength and the other side's raw answers never leave this function.
create or replace function public.my_connections()
returns table (
  other_id uuid,
  full_name text,
  eff_type public.rel_type,
  eff_years smallint,
  my_type public.rel_type,
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
    case when c.user_lo = (select auth.uid()) then c.lo_type else c.hi_type end,
    case when c.user_lo = (select auth.uid()) then c.lo_years else c.hi_years end,
    case when c.user_lo = (select auth.uid()) then c.lo_strength else c.hi_strength end,
    c.status
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
  where (c.user_lo = (select auth.uid()) or c.user_hi = (select auth.uid()))
    and p.deleted_at is null
$$;

create or replace function public.pending_for_me()
returns table (
  connection_id uuid,
  other_id uuid,
  full_name text,
  source text,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end,
    p.full_name,
    c.source,
    c.created_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_lo = (select auth.uid()) then c.user_hi else c.user_lo end
  where c.status = 'pending'
    and (
      (c.user_lo = (select auth.uid()) and c.lo_answered_at is null)
      or (c.user_hi = (select auth.uid()) and c.hi_answered_at is null)
    )
    and p.deleted_at is null
$$;

create or replace function public.suggest_from_roster()
returns table (
  id uuid,
  full_name text,
  headline text,
  pledge_class text,
  grad_year int
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.headline, p.pledge_class, p.grad_year
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

create or replace function public.request_connection(
  p_other uuid,
  p_type public.rel_type,
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

  if not private.shares_org(p_other) then
    raise exception 'not_shared_org';
  end if;

  if private.is_blocked_between(uid, p_other) then
    raise exception 'blocked';
  end if;

  select count(*) into recent_count from public.connections
    where initiated_by = uid and created_at > now() - interval '24 hours';
  if recent_count >= 30 then
    raise exception 'rate_limited';
  end if;

  conn_id := private.upsert_connection_answer(uid, p_other, p_type, p_years, p_strength, 'roster_suggestion');

  insert into public.events (user_id, name, props)
    values (uid, 'connection_requested', jsonb_build_object('connection_id', conn_id, 'source', 'roster_suggestion'));

  return conn_id;
end;
$$;

revoke all on function public.create_connect_token() from public;
revoke all on function public.create_sticker_token(uuid) from public;
revoke all on function public.connect_token_preview(text) from public;
revoke all on function public.redeem_connect_token(text, public.rel_type, int, int) from public;
revoke all on function public.answer_connection(uuid, public.rel_type, int, int) from public;
revoke all on function public.decline_connection(uuid) from public;
revoke all on function public.my_connections() from public;
revoke all on function public.pending_for_me() from public;
revoke all on function public.suggest_from_roster() from public;
revoke all on function public.request_connection(uuid, public.rel_type, int, int) from public;

grant execute on function public.create_connect_token() to authenticated;
grant execute on function public.create_sticker_token(uuid) to authenticated;
grant execute on function public.connect_token_preview(text) to authenticated;
grant execute on function public.redeem_connect_token(text, public.rel_type, int, int) to authenticated;
grant execute on function public.answer_connection(uuid, public.rel_type, int, int) to authenticated;
grant execute on function public.decline_connection(uuid) to authenticated;
grant execute on function public.my_connections() to authenticated;
grant execute on function public.pending_for_me() to authenticated;
grant execute on function public.suggest_from_roster() to authenticated;
grant execute on function public.request_connection(uuid, public.rel_type, int, int) to authenticated;
