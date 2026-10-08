-- ===== Phone numbers + matching contacts by phone =====
-- A member's phone number lives in its own table that only they can read
-- (profiles are visible to other members; phone numbers never are).
-- Matching works like email matching (0039): the browser normalizes each
-- contact's number to E.164 (+15551234567), hashes it with SHA-256, and
-- sends only the hashes. Nothing uploaded is stored.
-- Numbers aren't SMS-verified yet, so matches only show the member's own
-- profile (name, photo, headline) -- never the number itself.

create table public.profile_phones (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  phone_hash text not null,
  updated_at timestamptz not null default now()
);
create index profile_phones_hash_idx on public.profile_phones(phone_hash);
alter table public.profile_phones enable row level security;

-- Read and remove your own; writes go through set_my_phone().
create policy profile_phones_select on public.profile_phones for select to authenticated
  using (user_id = (select auth.uid()));
create policy profile_phones_delete on public.profile_phones for delete to authenticated
  using (user_id = (select auth.uid()));

-- Set or clear (null/empty) your phone number.
create or replace function public.set_my_phone(p_phone text)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_phone is null or p_phone = '' then
    delete from public.profile_phones where user_id = uid;
    return;
  end if;
  if p_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone';
  end if;
  perform private.check_rate_limit('set_phone:' || uid::text, 20, interval '1 day');
  insert into public.profile_phones (user_id, phone_e164, phone_hash)
    values (uid, p_phone, encode(extensions.digest(p_phone, 'sha256'), 'hex'))
  on conflict (user_id) do update
    set phone_e164 = excluded.phone_e164, phone_hash = excluded.phone_hash, updated_at = now();
end;
$$;
revoke all on function public.set_my_phone(text) from public, anon, authenticated;
grant execute on function public.set_my_phone(text) to authenticated;

-- Deleting or suspending an account removes its phone number from matching.
create or replace function private.drop_phone_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.profile_phones where user_id = new.id;
  end if;
  return new;
end;
$$;
create trigger profiles_drop_phone_on_delete
  after update of deleted_at on public.profiles
  for each row execute function private.drop_phone_on_delete();

-- Contacts matching by email and/or phone hashes. VOLATILE because the
-- rate limit writes a row (see 0040).
create or replace function public.find_people_by_contact_hashes(p_email_hashes text[], p_phone_hashes text[])
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  headline text,
  connected boolean,
  is_contact boolean
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce(cardinality(p_email_hashes), 0) + coalesce(cardinality(p_phone_hashes), 0) = 0 then
    return;
  end if;
  if coalesce(cardinality(p_email_hashes), 0) > 3000 or coalesce(cardinality(p_phone_hashes), 0) > 3000 then
    raise exception 'too_many';
  end if;
  perform private.check_rate_limit('find_friends:' || uid::text, 10, interval '1 hour');

  return query
    with matched as (
      select u.id as pid
        from auth.users u
        where u.email is not null
          and encode(extensions.digest(lower(u.email), 'sha256'), 'hex') = any (coalesce(p_email_hashes, '{}'))
      union
      select ph.user_id from public.profile_phones ph
        where ph.phone_hash = any (coalesce(p_phone_hashes, '{}'))
    )
    select p.id, p.full_name, p.username, p.avatar_url, p.headline,
      private.has_confirmed_connection(p.id),
      exists (
        select 1 from public.contact_requests cr
        where cr.status = 'accepted'
          and ((cr.requester_id = uid and cr.target_id = p.id) or (cr.requester_id = p.id and cr.target_id = uid))
      )
    from matched m
    join public.profiles p on p.id = m.pid
    where p.id <> uid
      and p.is_public
      and p.deleted_at is null
      and not private.is_blocked_between(uid, p.id)
    order by p.full_name
    limit 500;
end;
$$;
revoke all on function public.find_people_by_contact_hashes(text[], text[]) from public, anon, authenticated;
grant execute on function public.find_people_by_contact_hashes(text[], text[]) to authenticated;

notify pgrst, 'reload schema';
