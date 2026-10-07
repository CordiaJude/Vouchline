-- ===== Find friends from your contacts =====
-- The browser hashes each contact's email (SHA-256 of the lowercased
-- address) and sends only the hashes. We compare them against members'
-- sign-in emails and return matches. Nothing uploaded is stored -- no
-- address book, no "shadow profiles" of people who never joined.
-- Only discoverable members ("Let people find me") can be matched, never
-- yourself or anyone blocked either way. Capped and rate limited so it
-- can't be used to test whether arbitrary emails have accounts at scale.

create function public.find_people_by_email_hashes(p_hashes text[])
returns table (
  id uuid,
  full_name text,
  username text,
  avatar_url text,
  headline text,
  connected boolean,
  is_contact boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if coalesce(cardinality(p_hashes), 0) = 0 then
    return;
  end if;
  if cardinality(p_hashes) > 2000 then
    raise exception 'too_many';
  end if;
  perform private.check_rate_limit('find_friends:' || uid::text, 10, interval '1 hour');

  return query
    select p.id, p.full_name, p.username, p.avatar_url, p.headline,
      private.has_confirmed_connection(p.id),
      exists (
        select 1 from public.contact_requests cr
        where cr.status = 'accepted'
          and ((cr.requester_id = uid and cr.target_id = p.id) or (cr.requester_id = p.id and cr.target_id = uid))
      )
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.email is not null
      and encode(extensions.digest(lower(u.email), 'sha256'), 'hex') = any (p_hashes)
      and p.id <> uid
      and p.is_public
      and p.deleted_at is null
      and not private.is_blocked_between(uid, p.id)
    order by p.full_name
    limit 500;
end;
$$;

revoke all on function public.find_people_by_email_hashes(text[]) from public, anon, authenticated;
grant execute on function public.find_people_by_email_hashes(text[]) to authenticated;
