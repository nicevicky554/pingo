-- PART 22: fixes for row-level security failures found in 0007_restore_rls.sql.
--
-- 1. calls_select / calls_update subquery call_participants, and
--    call_participants_select / _write subquery calls. Each subquery runs the
--    other table's RLS, so inserting a call and returning it (insert ... select)
--    recurses between the two policies. Membership checks now go through
--    SECURITY DEFINER helpers that read the tables without re-entering RLS.
-- 2. channel_media_write let any authenticated user upload into any channel's
--    folder. Uploads now require the first path segment to be a channel the
--    caller owns or administers (matches `${channelId}/...` used by the app).
-- No data is removed.

create or replace function public.is_call_participant(call uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from call_participants where call_id = call and user_id = uid);
$$;
grant execute on function public.is_call_participant(uuid, uuid) to authenticated;

create or replace function public.is_call_initiator(call uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from calls where id = call and initiator_id = uid);
$$;
grant execute on function public.is_call_initiator(uuid, uuid) to authenticated;

create or replace function public.can_manage_channel(channel uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from channels where id = channel and owner_id = uid)
      or public.is_channel_admin(channel, uid);
$$;
grant execute on function public.can_manage_channel(uuid, uuid) to authenticated;

drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (initiator_id = auth.uid() or public.is_call_participant(id) or public.is_admin());

drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update to authenticated
  using (initiator_id = auth.uid() or public.is_call_participant(id) or public.is_admin())
  with check (initiator_id = auth.uid() or public.is_call_participant(id) or public.is_admin());

drop policy if exists call_participants_select on public.call_participants;
create policy call_participants_select on public.call_participants for select to authenticated
  using (user_id = auth.uid() or public.is_call_initiator(call_id) or public.is_call_participant(call_id));

drop policy if exists call_participants_write on public.call_participants;
create policy call_participants_write on public.call_participants for all to authenticated
  using (user_id = auth.uid() or public.is_call_initiator(call_id))
  with check (user_id = auth.uid() or public.is_call_initiator(call_id));

drop policy if exists channel_media_write on storage.objects;
create policy channel_media_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and public.can_manage_channel(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists channel_posts_write on public.channel_posts;
create policy channel_posts_write on public.channel_posts for all to authenticated
  using (public.can_manage_channel(channel_id))
  with check (author_id = auth.uid() and public.can_manage_channel(channel_id));
