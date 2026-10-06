-- ===== Phase 2 (UX overhaul): fix other people's profile pages =====
-- Live-audit finding: other people's profiles show almost nothing, and
-- the core actions (Request intro, Connect) are buried or missing
-- entirely. how_connected() only ever returned 'confirmed', 'claimed',
-- or null -- there was no way for the profile page to tell a pending
-- request (sent or received) apart from "no relationship at all", so it
-- could never show the right primary action. This adds a
-- relationship_status column using the same enum already returned by
-- discover_search/company_members ('confirmed', 'pending_sent',
-- 'pending_received', 'claimed', 'none'), so /app/u/[id] can show
-- Connect, Ask for an intro, or Respond as appropriate.

drop function if exists public.how_connected(uuid);
create function public.how_connected(p_other uuid)
returns table (
  kind text,
  relationship_status text,
  categories jsonb,
  years smallint,
  mutual_count int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  conn public.connections;
  claim public.claimed_connections;
  mutuals int;
  my_side text;
  my_answered timestamptz;
  their_answered timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select count(*)::int into mutuals from public.mutual_connections(p_other);

  select * into conn from public.connections
    where user_lo = least(uid, p_other) and user_hi = greatest(uid, p_other)
      and status = 'confirmed';

  if conn.id is not null then
    my_side := case when uid = conn.user_lo then 'lo' else 'hi' end;
    return query select
      'confirmed'::text,
      'confirmed'::text,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'category', mine.category,
          'is_former', mine.is_former,
          'is_primary', mine.is_primary,
          'confirmed', exists (
            select 1 from public.connection_categories other_cc
            where other_cc.connection_id = conn.id
              and other_cc.side <> mine.side
              and other_cc.category = mine.category
          )
        ) order by mine.is_primary desc, mine.category)
        from public.connection_categories mine
        where mine.connection_id = conn.id and mine.side = my_side
      ), '[]'::jsonb),
      case when uid = conn.user_lo then conn.lo_years else conn.hi_years end,
      mutuals;
    return;
  end if;

  -- A pending request (either direction) beats a claim -- there's an
  -- active, real request in flight, which is more actionable than a
  -- private claim only the caller can see.
  select * into conn from public.connections
    where user_lo = least(uid, p_other) and user_hi = greatest(uid, p_other)
      and status = 'pending';

  if conn.id is not null then
    my_answered := case when uid = conn.user_lo then conn.lo_answered_at else conn.hi_answered_at end;
    their_answered := case when uid = conn.user_lo then conn.hi_answered_at else conn.lo_answered_at end;
    return query select
      null::text,
      case
        when my_answered is not null and their_answered is null then 'pending_sent'
        when my_answered is null and their_answered is not null then 'pending_received'
        else 'none'
      end,
      '[]'::jsonb,
      null::smallint,
      mutuals;
    return;
  end if;

  select * into claim from public.claimed_connections
    where claimant_id = uid and claimed_person_id = p_other
    order by created_at desc limit 1;

  if claim.id is not null then
    return query select
      'claimed'::text,
      'claimed'::text,
      jsonb_build_array(jsonb_build_object(
        'category', claim.category, 'is_former', claim.is_former,
        'is_primary', true, 'confirmed', false
      )),
      claim.years, mutuals;
    return;
  end if;

  return query select null::text, 'none'::text, '[]'::jsonb, null::smallint, mutuals;
end;
$$;

revoke all on function public.how_connected(uuid) from public, anon, authenticated;
grant execute on function public.how_connected(uuid) to authenticated;
