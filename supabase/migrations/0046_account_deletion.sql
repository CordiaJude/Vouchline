-- ===== Deleting your account removes your content =====
-- delete_my_account (0003) only hid the profile and revoked connections.
-- The privacy policy promises more, so it now also removes what the
-- member created: vouches they wrote and received, the text and photos of
-- messages they sent (left as "message unsent" so chats still read
-- sensibly), their work/education history, contact requests, push
-- devices, want-to-meet list and pending email codes. Open reports keep
-- their content snapshot for safety review.
-- (Moderator suspensions also set deleted_at but don't call this, so a
-- suspension stays reversible.)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  update public.profiles set deleted_at = now()
  where id = uid and deleted_at is null;

  update public.memberships set status = 'removed'
  where user_id = uid and status = 'active';

  update public.connections set status = 'revoked'
  where status <> 'revoked' and (user_lo = uid or user_hi = uid);

  delete from public.vouches where author_id = uid or subject_id = uid;
  update public.messages set body = '', image_path = null, unsent_at = coalesce(unsent_at, now())
    where sender_id = uid;
  delete from public.profile_experiences where user_id = uid;
  delete from public.contact_requests where requester_id = uid or target_id = uid;
  delete from public.push_subscriptions where user_id = uid;
  delete from public.email_verifications where user_id = uid;
  delete from public.target_list_entries where owner_id = uid;
  -- verified_* columns are guarded (0038); this function may clear them.
  perform set_config('vouchline.verifying', 'on', true);
  update public.profiles
     set skills = '{}', interests = '{}', goals = '{}', headline = null, avatar_url = null,
         linkedin_url = null, verified_school_domain = null, verified_school_at = null,
         verified_work_domain = null, verified_work_at = null
   where id = uid;
  perform set_config('vouchline.verifying', '', true);
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
