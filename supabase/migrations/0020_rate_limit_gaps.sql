-- ===== Phase 13 security review: close rate-limit gaps on find_brokers
-- and the target-list write RPCs =====
-- find_brokers is a path-search query in the same cost class as
-- discover_search/company_members (both already limited to 60/min) but
-- was never given the same treatment. add_target/add_target_stub are
-- unthrottled write RPCs; add_target_stub can also insert into
-- person_stubs, a shared table, on every call with a novel LinkedIn URL.
-- request_intro/respond_intro_*/set_target_stage/set_target_note/
-- remove_target/my_target_list/notification RPCs were reviewed and left
-- as-is: request_intro already has its own counting-based caps,
-- respond_intro_* are self-limiting (one response per row), and the
-- rest are cheap per-owner reads/updates on the caller's own rows.

create or replace function public.find_brokers(p_target uuid)
returns table (
  broker_id uuid,
  broker_name text,
  broker_headline text,
  bridge_kind text,
  my_rel public.rel_type,
  their_rel public.rel_type,
  rank int
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.check_rate_limit('find_brokers:' || (select auth.uid())::text, 60, interval '1 minute');

  return query
  with me as (select (select auth.uid()) as id),
  confirmed_bridges as (
    select
      p.id, p.full_name, p.headline, 'confirmed'::text as bridge_kind,
      e1.eff_type as my_rel, e2.eff_type as their_rel,
      least(e1.eff_strength, e2.eff_strength) as sort_strength,
      (e1.eff_strength + e2.eff_strength) as sort_sum
    from me
    join public.connection_edges e1 on e1.src = me.id
    join public.connection_edges e2 on e2.src = e1.dst and e2.dst = p_target
    join public.profiles p on p.id = e1.dst and p.deleted_at is null
    where p_target <> me.id
      and not private.is_blocked_between(me.id, p_target)
      and not private.is_blocked_between(me.id, e1.dst)
  ),
  claimed_bridges as (
    select
      p.id, p.full_name, p.headline, 'claimed'::text as bridge_kind,
      cc.category as my_rel, e2.eff_type as their_rel,
      null::int as sort_strength, null::int as sort_sum
    from me
    join public.claimed_connections cc
      on cc.claimant_id = me.id and cc.claimed_person_id is not null
    join public.connection_edges e2 on e2.src = cc.claimed_person_id and e2.dst = p_target
    join public.profiles p on p.id = cc.claimed_person_id and p.deleted_at is null
    where p_target <> me.id
      and not private.is_blocked_between(me.id, p_target)
      and not private.is_blocked_between(me.id, cc.claimed_person_id)
      and not exists (
        select 1 from public.connection_edges e1c
        where e1c.src = me.id and e1c.dst = cc.claimed_person_id
      )
  ),
  combined as (
    select *, 0 as kind_order from confirmed_bridges
    union all
    select *, 1 as kind_order from claimed_bridges
  )
  select
    c.id, c.full_name, c.headline, c.bridge_kind, c.my_rel, c.their_rel,
    (row_number() over (
      order by c.kind_order, c.sort_strength desc nulls last, c.sort_sum desc nulls last, c.full_name
    ))::int as rank
  from combined c
  where not exists (
    select 1 from public.connection_edges d
    where d.src = (select id from me) and d.dst = p_target
  )
  order by rank
  limit 10;
end;
$$;

create or replace function public.add_target(p_person uuid, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  entry_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('add_target:' || uid::text, 60, interval '1 hour');

  if p_person = uid then
    raise exception 'cannot_target_self';
  end if;
  if not exists (select 1 from public.profiles where id = p_person and deleted_at is null) then
    raise exception 'not_found';
  end if;

  insert into public.target_list_entries (owner_id, target_person_id, note)
  values (uid, p_person, p_note)
  on conflict (owner_id, target_person_id) where target_person_id is not null
    do update set note = excluded.note, updated_at = now()
  returning id into entry_id;

  return entry_id;
end;
$$;

create or replace function public.add_target_stub(
  p_full_name text,
  p_linkedin_url text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  matched_person uuid;
  stub_id uuid;
  entry_id uuid;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  perform private.check_rate_limit('add_target:' || uid::text, 60, interval '1 hour');

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'invalid_name';
  end if;

  -- Resolve straight to a real account if the LinkedIn URL matches one
  -- already, same as claim_stub.
  if p_linkedin_url is not null then
    select id into matched_person from public.profiles
      where linkedin_url = p_linkedin_url and deleted_at is null limit 1;
  end if;

  if matched_person is not null then
    return public.add_target(matched_person, p_note);
  end if;

  if p_linkedin_url is not null then
    select id into stub_id from public.person_stubs where linkedin_url = p_linkedin_url;
  end if;

  if stub_id is null then
    insert into public.person_stubs (full_name, linkedin_url, created_by)
    values (trim(p_full_name), p_linkedin_url, uid)
    returning id into stub_id;
  end if;

  insert into public.target_list_entries (owner_id, target_stub_id, note)
  values (uid, stub_id, p_note)
  on conflict (owner_id, target_stub_id) where target_stub_id is not null
    do update set note = excluded.note, updated_at = now()
  returning id into entry_id;

  return entry_id;
end;
$$;

revoke all on function public.find_brokers(uuid) from public, anon, authenticated;
revoke all on function public.add_target(uuid, text) from public, anon, authenticated;
revoke all on function public.add_target_stub(text, text, text) from public, anon, authenticated;

grant execute on function public.find_brokers(uuid) to authenticated;
grant execute on function public.add_target(uuid, text) to authenticated;
grant execute on function public.add_target_stub(text, text, text) to authenticated;
