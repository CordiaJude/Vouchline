-- ===== generic rate limiting =====
-- Not RLS-protected: this table lives in the private schema, which isn't
-- in the API's exposed schema list at all (see design principle #3), so
-- it's unreachable via PostgREST regardless of role or policy.
create table private.rate_limit_hits (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_hits_key_time_idx on private.rate_limit_hits (key, created_at);

create or replace function private.check_rate_limit(
  p_key text,
  p_limit int,
  p_window interval,
  p_error text default 'rate_limited'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  recent_count int;
begin
  select count(*) into recent_count from private.rate_limit_hits
    where key = p_key and created_at > now() - p_window;
  if recent_count >= p_limit then
    raise exception '%', p_error;
  end if;
  insert into private.rate_limit_hits (key) values (p_key);
end;
$$;

-- Login happens before auth.uid() exists, so this is keyed by the
-- submitted email and is only ever called from trusted server code (the
-- login server action, using the service-role client) -- never from the
-- browser, hence no grant to anon or authenticated.
create or replace function public.check_and_log_login_attempt(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('login:' || lower(p_email), 5, interval '10 minutes');
end;
$$;

revoke all on function public.check_and_log_login_attempt(text) from public;
grant execute on function public.check_and_log_login_attempt(text) to service_role;

-- ===== search_members: add the 60/min limit, keep the rest identical =====
create or replace function public.search_members(q text)
returns table (id uuid, full_name text, headline text, employer text, city text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('search:' || (select auth.uid())::text, 60, interval '1 minute');

  return query
    select p.id, p.full_name, p.headline, p.employer, p.city
    from public.profiles p
    join public.memberships m on m.user_id = p.id and m.status = 'active'
    where m.org_id in (select private.my_org_ids())
      and p.id <> (select auth.uid())
      and p.deleted_at is null
      and not private.is_blocked_between((select auth.uid()), p.id)
      and (
        p.full_name ilike '%' || q || '%'
        or p.employer ilike '%' || q || '%'
        or p.city ilike '%' || q || '%'
      )
    limit 20;
end;
$$;

-- ===== check_and_log_ai_draft: move off the events table onto the same
-- shared rate-limit mechanism, same limits (1/10s, 30/day) =====
create or replace function public.check_and_log_ai_draft() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit(
    'ai_draft_burst:' || uid::text, 1, interval '10 seconds', 'rate_limited_burst'
  );
  perform private.check_rate_limit(
    'ai_draft_daily:' || uid::text, 30, interval '1 day', 'rate_limited_daily'
  );

  insert into public.events (user_id, name, props) values (uid, 'ai_draft', '{}'::jsonb);
end;
$$;

-- ===== pending_for_me: exclude blocked users, matching search/brokers =====
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
    and not private.is_blocked_between((select auth.uid()), p.id)
$$;

-- ===== grant audit fix =====
-- Every earlier migration wrote "revoke all on function X from public;"
-- believing that closed off anonymous access. It didn't: Supabase's
-- platform applies "alter default privileges ... grant execute on
-- functions to anon, authenticated, service_role" for the public schema,
-- so every function created since then picked up its own direct grant to
-- anon at creation time. Revoking from the PUBLIC pseudo-role only
-- removes what PUBLIC itself was granted -- it does not touch a
-- separate, already-existing grant to the named anon role. Every RPC in
-- this project has therefore been callable by anonymous (unauthenticated)
-- clients this whole time. Re-assert every grant explicitly here,
-- revoking from anon by name (not just public) before granting only to
-- the role that should actually have it.
revoke all on function public.delete_my_account() from public, anon, authenticated;
revoke all on function public.create_connect_token() from public, anon, authenticated;
revoke all on function public.create_sticker_token(uuid) from public, anon, authenticated;
revoke all on function public.connect_token_preview(text) from public, anon, authenticated;
revoke all on function public.redeem_connect_token(text, public.rel_type, int, int) from public, anon, authenticated;
revoke all on function public.answer_connection(uuid, public.rel_type, int, int) from public, anon, authenticated;
revoke all on function public.decline_connection(uuid) from public, anon, authenticated;
revoke all on function public.my_connections() from public, anon, authenticated;
revoke all on function public.pending_for_me() from public, anon, authenticated;
revoke all on function public.suggest_from_roster() from public, anon, authenticated;
revoke all on function public.request_connection(uuid, public.rel_type, int, int) from public, anon, authenticated;
revoke all on function public.find_brokers(uuid) from public, anon, authenticated;
revoke all on function public.search_members(text) from public, anon, authenticated;
revoke all on function public.request_intro(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.respond_intro_broker(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.respond_intro_target(uuid, boolean) from public, anon, authenticated;
revoke all on function public.withdraw_intro(uuid) from public, anon, authenticated;
revoke all on function public.check_and_log_ai_draft() from public, anon, authenticated;
revoke all on function public.expire_intros() from public, anon, authenticated, service_role;
revoke all on function public.org_invite_preview(text) from public, anon, authenticated;
revoke all on function public.redeem_org_invite(text) from public, anon, authenticated;
revoke all on function public.admin_list_members(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_reports(uuid) from public, anon, authenticated;
revoke all on function public.admin_resolve_report(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.check_and_log_login_attempt(text) from public, anon, authenticated, service_role;

grant execute on function public.delete_my_account() to authenticated;
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
grant execute on function public.find_brokers(uuid) to authenticated;
grant execute on function public.search_members(text) to authenticated;
grant execute on function public.request_intro(uuid, uuid, text) to authenticated;
grant execute on function public.respond_intro_broker(uuid, boolean, text) to authenticated;
grant execute on function public.respond_intro_target(uuid, boolean) to authenticated;
grant execute on function public.withdraw_intro(uuid) to authenticated;
grant execute on function public.check_and_log_ai_draft() to authenticated;
grant execute on function public.org_invite_preview(text) to authenticated;
grant execute on function public.redeem_org_invite(text) to authenticated;
grant execute on function public.admin_list_members(uuid) to authenticated;
grant execute on function public.admin_list_reports(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, uuid, text) to authenticated;
-- service_role-only: never callable by anon or authenticated.
grant execute on function public.expire_intros() to service_role;
grant execute on function public.check_and_log_login_attempt(text) to service_role;
