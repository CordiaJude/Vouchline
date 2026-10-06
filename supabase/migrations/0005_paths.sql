create or replace function public.find_brokers(p_target uuid)
returns table (broker_id uuid, broker_name text, broker_headline text, my_rel public.rel_type, their_rel public.rel_type, rank int)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as id)
  select p.id, p.full_name, p.headline, e1.eff_type, e2.eff_type,
         (row_number() over (order by least(e1.eff_strength, e2.eff_strength) desc,
                                       (e1.eff_strength + e2.eff_strength) desc,
                                       p.full_name))::int
  from me
  join public.connection_edges e1 on e1.src = me.id
  join public.connection_edges e2 on e2.src = e1.dst and e2.dst = p_target
  join public.profiles p on p.id = e1.dst and p.deleted_at is null
  where p_target <> me.id
    and private.shares_org(p_target)
    and not private.is_blocked_between(me.id, p_target)
    and not private.is_blocked_between(me.id, e1.dst)
    and not exists (select 1 from public.connection_edges d where d.src = me.id and d.dst = p_target)
  order by 6
  limit 10
$$;

create or replace function public.search_members(q text)
returns table (id uuid, full_name text, headline text, employer text, city text)
language sql stable security definer set search_path = '' as $$
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
  limit 20
$$;

revoke all on function public.find_brokers(uuid) from public;
revoke all on function public.search_members(text) from public;

grant execute on function public.find_brokers(uuid) to authenticated;
grant execute on function public.search_members(text) to authenticated;
