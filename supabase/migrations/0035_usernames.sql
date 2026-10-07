-- ===== Usernames + shareable profile links (vouchline.com/@jordan) =====
-- Every profile gets a username, generated from the name at signup
-- (jordanbullard, jordanbullard7, ...) and editable in Settings.
-- Rules: 3-30 chars, lowercase letters, numbers, underscores and periods,
-- can't start/end with a period, unique ignoring case, and not a word
-- the app uses for its own pages.

create or replace function private.is_reserved_username(u text)
returns boolean
language sql immutable set search_path = '' as $$
  select lower(u) = any (array[
    'app','admin','api','auth','login','logout','signup','signin','settings','onboarding',
    'invite','privacy','terms','acceptable-use','help','support','about','vouchline','me',
    'you','home','explore','intros','messages','notifications','network','search','connect',
    'c','u','dev-preview','null','undefined','root','staff','team','official','security'
  ])
$$;

alter table public.profiles add column username text;

alter table public.profiles add constraint profiles_username_format check (
  username is null or (
    username ~ '^[a-z0-9_.]{3,30}$'
    and username !~ '^\.' and username !~ '\.$' and username !~ '\.\.'
    and not private.is_reserved_username(username)
  )
);
create unique index profiles_username_key on public.profiles (lower(username));

-- Generate a free username from a full name.
create or replace function private.generate_username(p_full_name text)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  base text := left(regexp_replace(lower(coalesce(p_full_name, '')), '[^a-z0-9]', '', 'g'), 24);
  candidate text;
  n int := 0;
begin
  if char_length(base) < 3 or private.is_reserved_username(base) then
    base := 'member' || base;
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = candidate) loop
    n := n + 1;
    candidate := base || (floor(random() * power(10, least(2 + n / 5, 6)))::int)::text;
  end loop;
  return candidate;
end;
$$;

create or replace function private.set_default_username() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.username is null then
    new.username := private.generate_username(new.full_name);
  else
    new.username := lower(new.username);
  end if;
  return new;
end;
$$;

create trigger profiles_default_username
  before insert on public.profiles
  for each row execute function private.set_default_username();

-- Backfill everyone who already has a profile.
do $$
declare
  r record;
begin
  for r in select id, full_name from public.profiles where username is null order by created_at loop
    update public.profiles set username = private.generate_username(r.full_name) where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column username set not null;

-- Lowercase usernames on update too (Settings).
create or replace function private.lowercase_username() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.username := lower(new.username);
  return new;
end;
$$;
create trigger profiles_lowercase_username
  before update of username on public.profiles
  for each row execute function private.lowercase_username();

-- Settings: live "is this taken?" check.
create function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(p_username) ~ '^[a-z0-9_.]{3,30}$'
    and lower(p_username) !~ '^\.' and lower(p_username) !~ '\.$' and lower(p_username) !~ '\.\.'
    and not private.is_reserved_username(p_username)
    and not exists (
      select 1 from public.profiles
      where lower(username) = lower(p_username) and id <> (select auth.uid())
    )
$$;

-- The public profile card at /@username. Deliberately callable WITHOUT
-- signing in (that's the point of a share link), so it returns only the
-- basics, and only for people who chose "Let people find me".
create function public.public_profile_card(p_username text)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  headline text,
  city text,
  school_name text,
  connections_count int
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.full_name, p.avatar_url, p.headline, p.city, p.school_name,
         (select count(*)::int from public.connection_edges e where e.src = p.id)
  from public.profiles p
  where lower(p.username) = lower(ltrim(p_username, '@'))
    and p.is_public
    and p.deleted_at is null
$$;

revoke all on function public.username_available(text) from public, anon, authenticated;
revoke all on function public.public_profile_card(text) from public, anon, authenticated;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.public_profile_card(text) to anon, authenticated;
