-- ===== Verified badges: prove your school or workplace by email =====
--   school -- a .edu address  -> "Verified student/alum · baylor.edu"
--   work   -- a company address (not Gmail/Outlook/etc., not .edu)
--             -> "Verified · deloitte.com"
-- Flow: the server (service role only) creates a 6-digit code and emails
-- it; the member types it back in; verify_email_code() checks it. Codes
-- are stored hashed, expire in 15 minutes, allow 5 tries, and requests
-- are rate limited. Only the email's DOMAIN is shown -- never the address.

alter table public.profiles
  add column verified_school_domain text,
  add column verified_school_at timestamptz,
  add column verified_work_domain text,
  add column verified_work_at timestamptz;

create table public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('school', 'work')),
  email text not null,
  domain text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);
create index email_verifications_user_idx on public.email_verifications(user_id, created_at desc);
alter table public.email_verifications enable row level security;

-- Personal mailbox providers can't prove an employer.
create or replace function private.is_free_email_domain(d text)
returns boolean
language sql immutable set search_path = '' as $$
  select lower(d) = any (array[
    'gmail.com','googlemail.com','yahoo.com','ymail.com','outlook.com','hotmail.com','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','gmx.net','mail.com',
    'yandex.com','zoho.com','fastmail.com','hey.com','tutanota.com','duck.com','pm.me','att.net',
    'comcast.net','verizon.net','sbcglobal.net','cox.net','charter.net','earthlink.net'
  ])
$$;

-- Server-only: validate the address, store a hashed code, return the
-- plain code for the server to email. NOT granted to members.
create function public.create_email_verification(p_user uuid, p_email text, p_kind text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  email text := lower(trim(p_email));
  dom text;
  code text;
  recent int;
begin
  if p_kind not in ('school', 'work') then
    raise exception 'invalid_kind';
  end if;
  if email !~ '^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'invalid_email';
  end if;
  dom := split_part(email, '@', 2);
  if p_kind = 'school' and dom !~ '\.edu$' then
    raise exception 'not_school_email';
  end if;
  if p_kind = 'work' and (private.is_free_email_domain(dom) or dom ~ '\.edu$') then
    raise exception 'not_work_email';
  end if;

  select count(*) into recent from public.email_verifications
    where user_id = p_user and created_at > now() - interval '1 hour';
  if recent >= 5 then
    raise exception 'rate_limited';
  end if;

  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  delete from public.email_verifications where user_id = p_user and kind = p_kind;
  insert into public.email_verifications (user_id, kind, email, domain, code_hash)
    values (p_user, p_kind, email, dom, encode(extensions.digest(code, 'sha256'), 'hex'));
  return code;
end;
$$;

-- Badges are set only through verify_email_code: stop members from
-- writing these columns directly through the profiles_update policy.
create or replace function private.protect_verified_columns() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) = 'authenticated'
     and coalesce(current_setting('vouchline.verifying', true), '') <> 'on'
     and (new.verified_school_domain is distinct from old.verified_school_domain
          or new.verified_work_domain is distinct from old.verified_work_domain
          or new.verified_school_at is distinct from old.verified_school_at
          or new.verified_work_at is distinct from old.verified_work_at) then
    raise exception 'verified_fields_are_read_only';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_verified
  before update on public.profiles
  for each row execute function private.protect_verified_columns();

-- Member: type the code back in. Flips the guard on for its own update.
create function public.verify_email_code(p_kind text, p_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v public.email_verifications;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  select * into v from public.email_verifications
    where user_id = uid and kind = p_kind
    order by created_at desc limit 1;
  if not found or v.expires_at < now() then
    raise exception 'expired';
  end if;
  if v.attempts >= 5 then
    raise exception 'too_many_attempts';
  end if;
  if v.code_hash <> encode(extensions.digest(trim(p_code), 'sha256'), 'hex') then
    update public.email_verifications set attempts = attempts + 1 where id = v.id;
    raise exception 'wrong_code';
  end if;

  perform set_config('vouchline.verifying', 'on', true);
  if p_kind = 'school' then
    update public.profiles set verified_school_domain = v.domain, verified_school_at = now() where id = uid;
  else
    update public.profiles set verified_work_domain = v.domain, verified_work_at = now() where id = uid;
  end if;
  perform set_config('vouchline.verifying', '', true);
  delete from public.email_verifications where user_id = uid and kind = p_kind;
  return v.domain;
end;
$$;

-- Member: remove a badge (e.g. after changing jobs).
create function public.remove_verification(p_kind text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('vouchline.verifying', 'on', true);
  update public.profiles
     set verified_school_domain = case when p_kind = 'school' then null else verified_school_domain end,
         verified_school_at = case when p_kind = 'school' then null else verified_school_at end,
         verified_work_domain = case when p_kind = 'work' then null else verified_work_domain end,
         verified_work_at = case when p_kind = 'work' then null else verified_work_at end
   where id = (select auth.uid());
  perform set_config('vouchline.verifying', '', true);
end;
$$;

-- Show badges on the public share card too.
drop function if exists public.public_profile_card(text);
create function public.public_profile_card(p_username text)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  headline text,
  city text,
  school_name text,
  connections_count int,
  verified_school_domain text,
  verified_work_domain text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.headline, p.city, p.school_name,
         (select count(*)::int from public.connection_edges e where e.src = p.id),
         p.verified_school_domain, p.verified_work_domain
  from public.profiles p
  where lower(p.username) = lower(ltrim(p_username, '@'))
    and p.is_public
    and p.deleted_at is null
$$;

revoke all on function public.create_email_verification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.verify_email_code(text, text) from public, anon, authenticated;
revoke all on function public.remove_verification(text) from public, anon, authenticated;
revoke all on function public.public_profile_card(text) from public, anon, authenticated;

grant execute on function public.create_email_verification(uuid, text, text) to service_role;
grant execute on function public.verify_email_code(text, text) to authenticated;
grant execute on function public.remove_verification(text) to authenticated;
grant execute on function public.public_profile_card(text) to anon, authenticated;
