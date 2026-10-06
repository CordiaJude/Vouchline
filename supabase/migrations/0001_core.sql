create extension if not exists citext;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.rel_type as enum ('pledge_brother','mentor','coworker','classmate','friend');
create type public.org_role as enum ('member','admin');
create type public.conn_status as enum ('pending','confirmed','rejected','revoked');
create type public.intro_status as enum ('pending_broker','declined_broker','pending_target','declined_target','accepted','expired','withdrawn');

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext not null unique,
  kind text not null check (kind in ('chapter','alumni_association','national')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  headline text check (char_length(headline) <= 120),
  grad_year int check (grad_year between 1940 and 2040),
  pledge_class text check (char_length(pledge_class) <= 40),
  employer text check (char_length(employer) <= 80),
  city text check (char_length(city) <= 80),
  linkedin_url text check (linkedin_url ~ '^https://(www\.)?linkedin\.com/'),
  is_18_plus boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.memberships (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null default 'member',
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id, org_id) where status = 'active';

create table public.org_invites (
  token text primary key default encode(extensions.gen_random_bytes(16),'hex'),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  email citext,                       -- null = multi-use link
  max_uses int not null default 1 check (max_uses between 1 and 500),
  uses int not null default 0,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table public.connect_tokens (
  token text primary key default encode(extensions.gen_random_bytes(16),'hex'),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);
create index connect_tokens_owner_idx on public.connect_tokens(owner_id);

-- One row per unordered pair. Raw answers are private.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null references public.profiles(id) on delete cascade,
  user_hi uuid not null references public.profiles(id) on delete cascade,
  initiated_by uuid not null references public.profiles(id),
  source text not null check (source in ('qr','roster_suggestion')),
  lo_type public.rel_type, lo_years smallint check (lo_years between 0 and 70), lo_strength smallint check (lo_strength between 1 and 3), lo_answered_at timestamptz,
  hi_type public.rel_type, hi_years smallint check (hi_years between 0 and 70), hi_strength smallint check (hi_strength between 1 and 3), hi_answered_at timestamptz,
  status public.conn_status not null default 'pending',
  eff_type public.rel_type,     -- only when lo_type = hi_type
  eff_years smallint,           -- least(lo_years, hi_years)
  eff_strength smallint,        -- least(lo_strength, hi_strength); NEVER returned to clients
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_lo < user_hi),
  unique (user_lo, user_hi)
);
create index connections_hi_idx on public.connections(user_hi);

-- Symmetric edge table for fast graph reads; maintained by trigger; confirmed only.
create table public.connection_edges (
  src uuid not null references public.profiles(id) on delete cascade,
  dst uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  eff_type public.rel_type,
  eff_years smallint,
  eff_strength smallint not null,
  primary key (src, dst)
);
create index connection_edges_dst_idx on public.connection_edges(dst, src);

create table public.intro_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  broker_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  ask text not null check (char_length(ask) between 20 and 1200),
  status public.intro_status not null default 'pending_broker',
  broker_note text check (char_length(broker_note) <= 500),
  created_at timestamptz not null default now(),
  broker_responded_at timestamptz,
  target_responded_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  check (requester_id <> target_id and broker_id <> requester_id and broker_id <> target_id)
);
create index intro_requester_idx on public.intro_requests(requester_id, created_at);
create index intro_broker_idx on public.intro_requests(broker_id, status);
create index intro_target_idx on public.intro_requests(target_id, status);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create index blocks_blocked_idx on public.blocks(blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  intro_request_id uuid references public.intro_requests(id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  org_id uuid references public.orgs(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_name_time_idx on public.events(name, created_at);

-- ===== private helpers =====
create or replace function private.my_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.memberships
  where user_id = (select auth.uid()) and status = 'active'
$$;

create or replace function private.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
    where org_id = p_org and user_id = (select auth.uid()) and role = 'admin' and status = 'active')
$$;

create or replace function private.shares_org(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships a join public.memberships b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = p_other
      and a.status = 'active' and b.status = 'active')
$$;

create or replace function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- ===== RLS =====
alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.org_invites enable row level security;
alter table public.connect_tokens enable row level security;
alter table public.connections enable row level security;
alter table public.connection_edges enable row level security;
alter table public.intro_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.events enable row level security;

create policy orgs_select on public.orgs for select to authenticated
  using (id in (select private.my_org_ids()));

create policy profiles_select on public.profiles for select to authenticated
  using (deleted_at is null and (id = (select auth.uid()) or private.shares_org(id)));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
  using (org_id in (select private.my_org_ids()));
create policy memberships_admin_update on public.memberships for update to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));

create policy invites_admin_all on public.org_invites for all to authenticated
  using ((select private.is_org_admin(org_id))) with check ((select private.is_org_admin(org_id)));

create policy tokens_owner_select on public.connect_tokens for select to authenticated
  using (owner_id = (select auth.uid()));

-- connections, connection_edges: NO policies => no direct access. RPC only.

create policy intro_select on public.intro_requests for select to authenticated
  using (
    requester_id = (select auth.uid())
    or broker_id = (select auth.uid())
    or (target_id = (select auth.uid()) and status in ('pending_target','accepted','declined_target'))
  );
-- no insert/update policies: RPC only.

create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
-- events: insert via RPC only; no select for users.
