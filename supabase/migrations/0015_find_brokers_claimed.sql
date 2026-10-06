-- ===== find_brokers: also surface claimed bridges, ranked below confirmed =====
-- Per the spec's CONTEXT: "see ranked bridges (confirmed ranked above
-- claimed)". Until now find_brokers only ever traversed connection_edges
-- (confirmed-only), so a bridge through someone the caller has merely
-- claimed was invisible even though it's a real, private signal only the
-- caller can see. The broker->target leg must still come from
-- connection_edges -- claimed_connections is private to the claimant, so
-- there's no way to query "did the broker claim the target" from here.
drop function if exists public.find_brokers(uuid);

create function public.find_brokers(p_target uuid)
returns table (
  broker_id uuid,
  broker_name text,
  broker_headline text,
  bridge_kind text,
  my_rel public.rel_type,
  their_rel public.rel_type,
  rank int
)
language sql stable security definer set search_path = '' as $$
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
  limit 10
$$;

revoke all on function public.find_brokers(uuid) from public, anon, authenticated;
grant execute on function public.find_brokers(uuid) to authenticated;
