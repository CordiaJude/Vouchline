-- ===== Vouches: short written endorsements on profiles =====
-- "Worked with Jordan for 3 years -- the most reliable PM I know."
-- Abuse guards:
--   * only a CONFIRMED connection can vouch (no strangers, no contacts)
--   * nothing is public until the person it's about approves it; they can
--     hide it any time, and any edit sends it back for approval
--   * one vouch per author per person, 20-500 characters
--   * rate limited; blocks hide vouches both ways
-- The author's own relationship label for the connection (e.g.
-- "Coworker") is shown with it, since they're choosing to vouch publicly.

create table public.vouches (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 20 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (author_id <> subject_id),
  unique (author_id, subject_id)
);
create index vouches_subject_idx on public.vouches(subject_id, status);
alter table public.vouches enable row level security;

-- Can the caller see this person's profile? Mirrors profiles_select.
create or replace function private.can_view_profile(p_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_id and p.deleted_at is null
      and (
        p.id = (select auth.uid())
        or p.is_public
        or private.shares_org(p.id)
        or private.has_confirmed_connection(p.id)
      )
  )
$$;

create function public.write_vouch(p_subject uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  body text := trim(p_body);
  vid uuid;
  author_name text;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_subject = uid then
    raise exception 'cannot_vouch_self';
  end if;
  if not private.has_confirmed_connection(p_subject) then
    raise exception 'not_connected';
  end if;
  if private.is_blocked_between(uid, p_subject) then
    raise exception 'blocked';
  end if;
  if char_length(body) < 20 or char_length(body) > 500 then
    raise exception 'invalid_length';
  end if;
  perform private.check_rate_limit('write_vouch:' || uid::text, 10, interval '1 day');

  insert into public.vouches (author_id, subject_id, body)
    values (uid, p_subject, body)
    on conflict (author_id, subject_id) do update
      set body = excluded.body, status = 'pending', updated_at = now()
    returning id into vid;

  select full_name into author_name from public.profiles where id = uid;
  perform private.create_notification(
    p_subject, 'vouch_received',
    coalesce(author_name, 'Someone') || ' wrote you a vouch',
    'Review it before it shows on your profile.',
    '/app/me?tab=vouches'
  );
  return vid;
end;
$$;

create function public.respond_vouch(p_vouch uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.vouches
     set status = case when p_approve then 'approved' else 'hidden' end, updated_at = now()
   where id = p_vouch and subject_id = (select auth.uid());
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

create function public.delete_my_vouch(p_subject uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from public.vouches where author_id = (select auth.uid()) and subject_id = p_subject
$$;

-- Approved vouches on someone's profile (anyone who can see the profile).
create function public.profile_vouches(p_subject uuid)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  author_headline text,
  relationship public.rel_type,
  body text,
  updated_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not private.can_view_profile(p_subject) then
    return;
  end if;
  return query
    select v.id, a.id, a.full_name, a.avatar_url, a.headline,
      (
        select cc.category from public.connections c
        join public.connection_categories cc
          on cc.connection_id = c.id and cc.is_primary
         and cc.side = (case when c.user_lo = v.author_id then 'lo' else 'hi' end)
        where c.user_lo = least(v.author_id, v.subject_id) and c.user_hi = greatest(v.author_id, v.subject_id)
        limit 1
      ),
      v.body, v.updated_at
    from public.vouches v
    join public.profiles a on a.id = v.author_id and a.deleted_at is null
    where v.subject_id = p_subject
      and v.status = 'approved'
      and not private.is_blocked_between(uid, v.author_id)
      and not private.is_blocked_between(v.subject_id, v.author_id)
    order by v.updated_at desc;
end;
$$;

-- The subject's own view: everything about them, including pending and hidden.
create function public.my_received_vouches()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar_url text,
  body text,
  status text,
  updated_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select v.id, a.id, a.full_name, a.avatar_url, v.body, v.status, v.updated_at
  from public.vouches v
  join public.profiles a on a.id = v.author_id and a.deleted_at is null
  where v.subject_id = (select auth.uid())
    and not private.is_blocked_between(v.subject_id, v.author_id)
  order by (v.status = 'pending') desc, v.updated_at desc
$$;

-- The author's own vouch for someone (to edit it), with its status.
create function public.my_vouch_for(p_subject uuid)
returns table (id uuid, body text, status text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.body, v.status from public.vouches v
  where v.author_id = (select auth.uid()) and v.subject_id = p_subject
$$;

revoke all on function public.write_vouch(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_vouch(uuid, boolean) from public, anon, authenticated;
revoke all on function public.delete_my_vouch(uuid) from public, anon, authenticated;
revoke all on function public.profile_vouches(uuid) from public, anon, authenticated;
revoke all on function public.my_received_vouches() from public, anon, authenticated;
revoke all on function public.my_vouch_for(uuid) from public, anon, authenticated;

grant execute on function public.write_vouch(uuid, text) to authenticated;
grant execute on function public.respond_vouch(uuid, boolean) to authenticated;
grant execute on function public.delete_my_vouch(uuid) to authenticated;
grant execute on function public.profile_vouches(uuid) to authenticated;
grant execute on function public.my_received_vouches() to authenticated;
grant execute on function public.my_vouch_for(uuid) to authenticated;
