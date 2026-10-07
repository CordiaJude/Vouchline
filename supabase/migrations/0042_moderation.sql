-- ===== Site-wide moderation =====
-- Reports used to cover intros only and were reviewed by org admins, but
-- most members aren't in an org. Now:
--   * members can report a person, a chat message, or a vouch
--   * site admins (platform_admins) review every report in one queue and
--     can dismiss it, remove the content, or suspend the account
-- Suspending sets profiles.deleted_at, which every query already treats
-- as gone (hidden from search, chats, profiles); it's reversible.

create table public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

alter table public.reports
  add column kind text not null default 'user' check (kind in ('user', 'intro', 'message', 'vouch')),
  add column message_id uuid references public.messages(id) on delete set null,
  add column vouch_id uuid references public.vouches(id) on delete set null,
  -- Snapshot of what was reported, so removing it doesn't erase the evidence.
  add column content_snapshot text,
  add column handled_by uuid references public.profiles(id) on delete set null,
  add column handled_at timestamptz,
  add column admin_note text check (char_length(admin_note) <= 1000);

update public.reports set kind = 'intro' where intro_request_id is not null;
create index reports_status_idx on public.reports(status, created_at desc);

-- ===== member: report something =====
create function public.report_content(
  p_kind text,
  p_reason text,
  p_reported uuid default null,
  p_message uuid default null,
  p_vouch uuid default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  reported uuid := p_reported;
  snapshot text;
  rid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'reason_too_short';
  end if;
  perform private.check_rate_limit('report:' || uid::text, 20, interval '1 day');

  if p_kind = 'message' then
    -- Only messages you can see (a conversation you're in), and not your own.
    select m.sender_id, m.body into reported, snapshot
    from public.messages m
    where m.id = p_message and private.is_conversation_member(m.conversation_id);
    if not found or reported is null then
      raise exception 'not_found';
    end if;
  elsif p_kind = 'vouch' then
    select v.author_id, v.body into reported, snapshot
    from public.vouches v
    where v.id = p_vouch and private.can_view_profile(v.subject_id);
    if not found then
      raise exception 'not_found';
    end if;
  elsif p_kind = 'user' then
    if reported is null or not exists (select 1 from public.profiles where id = reported) then
      raise exception 'not_found';
    end if;
  else
    raise exception 'invalid_kind';
  end if;

  if reported = uid then
    raise exception 'cannot_report_self';
  end if;

  insert into public.reports (reporter_id, reported_id, reason, kind, message_id, vouch_id, content_snapshot)
    values (uid, reported, trim(p_reason), p_kind, p_message, p_vouch, left(snapshot, 4000))
    returning id into rid;
  return rid;
end;
$$;

-- ===== admin: the queue =====
create function public.mod_list_reports(p_status text default 'open')
returns table (
  id uuid,
  kind text,
  reason text,
  status text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_username text,
  reported_suspended boolean,
  content text,
  content_removed boolean,
  intro_request_id uuid,
  prior_reports int,
  admin_note text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception 'not_authorized';
  end if;
  return query
    select r.id, r.kind, r.reason, r.status, r.created_at,
      rp.id, rp.full_name,
      tp.id, tp.full_name, tp.username, tp.deleted_at is not null,
      coalesce(r.content_snapshot, ''),
      (r.kind = 'message' and r.message_id is null)
        or (r.kind = 'vouch' and (r.vouch_id is null or exists (
              select 1 from public.vouches v where v.id = r.vouch_id and v.status = 'hidden'))),
      r.intro_request_id,
      (select count(*)::int from public.reports r2 where r2.reported_id = r.reported_id and r2.id <> r.id),
      r.admin_note
    from public.reports r
    join public.profiles rp on rp.id = r.reporter_id
    join public.profiles tp on tp.id = r.reported_id
    where (p_status = 'all' or r.status = p_status)
    order by r.created_at desc
    limit 200;
end;
$$;

-- p_action: dismiss | remove_content | suspend | unsuspend
create function public.mod_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.reports;
begin
  if not private.is_platform_admin() then
    raise exception 'not_authorized';
  end if;
  select * into r from public.reports where id = p_report;
  if not found then
    raise exception 'not_found';
  end if;

  if p_action = 'remove_content' then
    if r.kind = 'message' and r.message_id is not null then
      delete from public.messages where id = r.message_id;
    elsif r.kind = 'vouch' and r.vouch_id is not null then
      update public.vouches set status = 'hidden', updated_at = now() where id = r.vouch_id;
    end if;
  elsif p_action = 'suspend' then
    update public.profiles set deleted_at = now() where id = r.reported_id and deleted_at is null;
  elsif p_action = 'unsuspend' then
    update public.profiles set deleted_at = null where id = r.reported_id;
  elsif p_action <> 'dismiss' then
    raise exception 'invalid_action';
  end if;

  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         handled_by = uid, handled_at = now(),
         admin_note = coalesce(nullif(trim(p_note), ''), admin_note)
   where id = p_report;
end;
$$;

-- 'active', 'inactive' (suspended or deleted), or 'none' (no profile yet).
-- profiles_select hides deleted rows even from their owner, so the app
-- can't tell "suspended" from "never onboarded" without this.
create function public.my_account_state()
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when p.deleted_at is null then 'active' else 'inactive' end
       from public.profiles p where p.id = (select auth.uid())),
    'none')
$$;

create function public.am_platform_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin()
$$;

revoke all on function public.report_content(text, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mod_list_reports(text) from public, anon, authenticated;
revoke all on function public.mod_resolve_report(uuid, text, text) from public, anon, authenticated;
revoke all on function public.am_platform_admin() from public, anon, authenticated;
revoke all on function public.my_account_state() from public, anon, authenticated;

grant execute on function public.report_content(text, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.mod_list_reports(text) to authenticated;
grant execute on function public.mod_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.am_platform_admin() to authenticated;
grant execute on function public.my_account_state() to authenticated;

notify pgrst, 'reload schema';
