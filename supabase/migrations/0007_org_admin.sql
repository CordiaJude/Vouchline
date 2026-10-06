-- Only populated for email-bound (CSV roster) invites, so the admin
-- dashboard can show who was invited before they've signed up. Multi-use
-- links created without an email leave these null.
alter table public.org_invites
  add column full_name text,
  add column grad_year int,
  add column pledge_class text;

-- Lets the invite recipient preview which org/invite this is before
-- signing in fully, without granting direct SELECT on org_invites (RLS
-- there is admin-only -- the recipient usually isn't an admin).
create or replace function public.org_invite_preview(p_token text)
returns table (org_id uuid, org_name text, email public.citext, full_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.org_invites;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into inv from public.org_invites
    where token = p_token and expires_at > now() and uses < max_uses;
  if inv.token is null then
    raise exception 'invalid_invite';
  end if;

  return query select o.id, o.name, inv.email, inv.full_name
    from public.orgs o where o.id = inv.org_id;
end;
$$;

-- Memberships have no self-serve insert policy (by design -- joining an
-- org must go through an invite), so redeeming one has to be a RPC.
create or replace function public.redeem_org_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  uid_email public.citext;
  inv public.org_invites;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_required';
  end if;

  select * into inv from public.org_invites where token = p_token for update;
  if inv.token is null then
    raise exception 'invalid_invite';
  end if;
  if inv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'invite_exhausted';
  end if;

  if inv.email is not null then
    select email into uid_email from auth.users where id = uid;
    if uid_email is distinct from inv.email then
      raise exception 'email_mismatch';
    end if;
  end if;

  insert into public.memberships (org_id, user_id, role, status)
  values (inv.org_id, uid, 'member', 'active')
  on conflict (org_id, user_id) do update set status = 'active';

  update public.org_invites set uses = uses + 1 where token = p_token;

  return inv.org_id;
end;
$$;

-- Members list needs auth.users emails, which nothing else can read.
create or replace function public.admin_list_members(p_org uuid)
returns table (
  user_id uuid,
  full_name text,
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
    select p.id, p.full_name, u.email::text, m.role, m.status, m.created_at
    from public.memberships m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    where m.org_id = p_org
    order by m.created_at;
end;
$$;

-- reports has no admin read/write policy at all (only self-insert), so
-- both listing and resolving org reports need RPCs.
create or replace function public.admin_list_reports(p_org uuid)
returns table (
  id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reason text,
  status text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;

  return query
    select r.id, rp.full_name, r.reported_id, tp.full_name, r.reason, r.status, r.created_at
    from public.reports r
    join public.profiles rp on rp.id = r.reporter_id
    join public.profiles tp on tp.id = r.reported_id
    where r.reported_id in (
      select user_id from public.memberships where org_id = p_org and status = 'active'
    )
    and r.status = 'open'
    order by r.created_at;
end;
$$;

create or replace function public.admin_resolve_report(
  p_org uuid,
  p_report_id uuid,
  p_action text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rpt public.reports;
begin
  if not private.is_org_admin(p_org) then
    raise exception 'not_authorized';
  end if;
  if p_action not in ('remove_member', 'dismiss') then
    raise exception 'invalid_action';
  end if;

  select * into rpt from public.reports where id = p_report_id;
  if rpt.id is null then
    raise exception 'not_found';
  end if;
  if not exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = rpt.reported_id and status = 'active'
  ) then
    raise exception 'not_in_org';
  end if;

  if p_action = 'remove_member' then
    update public.memberships set status = 'removed'
      where org_id = p_org and user_id = rpt.reported_id;
  end if;

  update public.reports set
    status = case when p_action = 'remove_member' then 'actioned' else 'dismissed' end
    where id = p_report_id;
end;
$$;

revoke all on function public.org_invite_preview(text) from public;
revoke all on function public.redeem_org_invite(text) from public;
revoke all on function public.admin_list_members(uuid) from public;
revoke all on function public.admin_list_reports(uuid) from public;
revoke all on function public.admin_resolve_report(uuid, uuid, text) from public;

grant execute on function public.org_invite_preview(text) to authenticated;
grant execute on function public.redeem_org_invite(text) to authenticated;
grant execute on function public.admin_list_members(uuid) to authenticated;
grant execute on function public.admin_list_reports(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, uuid, text) to authenticated;
