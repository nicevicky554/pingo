-- ===========================================================================
-- PINGO — RESTORE ROW LEVEL SECURITY
-- ===========================================================================
-- Replaces the historical RLS-removal step. Re-enables RLS on every public table, Storage
-- objects and Realtime messages, then recreates the access policies. Normal
-- browser access uses the publishable key plus the signed-in user's JWT.
--
-- The Supabase secret key is never used by the Vite client.
-- ===========================================================================

-- 1. Enable RLS on every current public table, including future additions.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename from pg_tables where schemaname = 'public'
    union
    select schemaname, tablename from pg_partitioned_tables where schemaname = 'public'
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
  end loop;
end $$;

alter table storage.objects enable row level security;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    alter table realtime.messages enable row level security;
  end if;
end $$;

-- 2. Remove the anonymous table grants created by 0005. Anonymous callers only
--    need the public branding RPC and public Storage objects.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant execute on function public.get_public_branding() to anon, authenticated;

-- 3. Profiles and account data.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and status = 'active');
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.has_admin_permission('users.suspend'))
  with check (public.has_admin_permission('users.suspend'));

drop policy if exists settings_own on public.user_settings;
create policy settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists contacts_own on public.contacts;
create policy contacts_own on public.contacts for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- 4. Conversations, membership and messages.
drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists conversations_admin_update on public.conversations;
create policy conversations_admin_update on public.conversations for update to authenticated
  using (public.is_conversation_admin(id) or public.is_admin())
  with check (public.is_conversation_admin(id) or public.is_admin());
drop policy if exists conversations_owner_delete on public.conversations;
create policy conversations_owner_delete on public.conversations for delete to authenticated
  using (public.is_conversation_admin(id) or public.is_admin());

drop policy if exists members_select on public.conversation_members;
create policy members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
drop policy if exists members_insert on public.conversation_members;
create policy members_insert on public.conversation_members for insert to authenticated
  with check (
    public.is_conversation_admin(conversation_id)
    or (user_id = auth.uid() and public.is_conversation_member(conversation_id))
  );
drop policy if exists members_update on public.conversation_members;
create policy members_update on public.conversation_members for update to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id))
  with check (user_id = auth.uid() or public.is_conversation_admin(conversation_id));
drop policy if exists members_delete on public.conversation_members;
create policy members_delete on public.conversation_members for delete to authenticated
  using (user_id = auth.uid() or public.is_conversation_admin(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and deleted_at is null
    and (expires_at is null or expires_at > now())
  );
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and exists (select 1 from conversations c where c.id = conversation_id
      and (not c.announce_only or public.is_conversation_admin(c.id)))
    and (
      exists (select 1 from conversations c where c.id = conversation_id and c.type <> 'direct')
      or not exists (
        select 1 from conversation_members om
        join blocks b on (b.blocker_id = om.user_id and b.blocked_id = auth.uid())
          or (b.blocker_id = auth.uid() and b.blocked_id = om.user_id)
        where om.conversation_id = conversation_id and om.user_id <> auth.uid()
      )
    )
  );
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (
    (sender_id = auth.uid() and deleted_at is null)
    or public.is_conversation_admin(conversation_id)
    or public.is_admin()
  )
  with check (public.is_conversation_member(conversation_id));
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (public.is_conversation_admin(conversation_id) or public.is_admin());

drop policy if exists receipts_select on public.message_receipts;
create policy receipts_select on public.message_receipts for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)));
drop policy if exists receipts_upsert on public.message_receipts;
create policy receipts_upsert on public.message_receipts for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists receipts_update on public.message_receipts;
create policy receipts_update on public.message_receipts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists reactions_select on public.message_reactions;
create policy reactions_select on public.message_reactions for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)));
drop policy if exists reactions_write on public.message_reactions;
create policy reactions_write on public.message_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from messages m where m.id = message_id and public.is_conversation_member(m.conversation_id)));

drop policy if exists deletions_own on public.message_deletions;
create policy deletions_own on public.message_deletions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pins_members on public.message_pins;
create policy pins_members on public.message_pins for all to authenticated
  using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id) and pinned_by = auth.uid());

-- 5. Status / stories.
drop policy if exists status_select on public.status_updates;
create policy status_select on public.status_updates for select to authenticated
  using (user_id = auth.uid() or (expires_at > now() and public.can_view_status(user_id)));
drop policy if exists status_insert on public.status_updates;
create policy status_insert on public.status_updates for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists status_delete on public.status_updates;
create policy status_delete on public.status_updates for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists status_views_select on public.status_views;
create policy status_views_select on public.status_views for select to authenticated
  using (exists (select 1 from status_updates s where s.id = status_id and (s.user_id = auth.uid() or public.can_view_status(s.user_id))));
drop policy if exists status_views_write on public.status_views;
create policy status_views_write on public.status_views for insert to authenticated
  with check (viewer_id = auth.uid());

drop policy if exists status_reactions_select on public.status_reactions;
create policy status_reactions_select on public.status_reactions for select to authenticated
  using (exists (select 1 from status_updates s where s.id = status_id and s.user_id = auth.uid()));
drop policy if exists status_reactions_write on public.status_reactions;
create policy status_reactions_write on public.status_reactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists status_audience_own on public.status_audience;
create policy status_audience_own on public.status_audience for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 6. Communities and groups.
drop policy if exists communities_select on public.communities;
create policy communities_select on public.communities for select to authenticated using (true);
drop policy if exists communities_insert on public.communities;
create policy communities_insert on public.communities for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists community_members_select on public.community_members;
create policy community_members_select on public.community_members for select to authenticated using (true);
drop policy if exists community_members_write on public.community_members;
create policy community_members_write on public.community_members for all to authenticated
  using (user_id = auth.uid() or exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid()))
  with check (user_id = auth.uid() or exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid()));

drop policy if exists community_groups_select on public.community_groups;
create policy community_groups_select on public.community_groups for select to authenticated using (true);
drop policy if exists community_groups_write on public.community_groups;
create policy community_groups_write on public.community_groups for all to authenticated
  using (exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from communities c where c.id = community_id and c.owner_id = auth.uid()));

-- 7. Channels and broadcast posts.
create or replace function public.is_channel_admin(channel uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from channel_members
    where channel_id = channel and user_id = uid and role in ('owner','admin')
  );
$$;
grant execute on function public.is_channel_admin(uuid, uuid) to authenticated;

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (is_public or owner_id = auth.uid() or public.is_channel_member(id) or public.is_admin());
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated
  using (owner_id = auth.uid() or public.is_channel_admin(id))
  with check (owner_id = auth.uid() or public.is_channel_admin(id));

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members for select to authenticated using (true);
drop policy if exists channel_members_write on public.channel_members;
create policy channel_members_write on public.channel_members for all to authenticated
  using (user_id = auth.uid() or public.is_channel_admin(channel_id))
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id));

drop policy if exists channel_posts_select on public.channel_posts;
create policy channel_posts_select on public.channel_posts for select to authenticated
  using (exists (select 1 from channels c where c.id = channel_id
    and (c.is_public or c.owner_id = auth.uid() or public.is_channel_member(c.id))));
drop policy if exists channel_posts_write on public.channel_posts;
create policy channel_posts_write on public.channel_posts for all to authenticated
  using (exists (select 1 from channels c where c.id = channel_id
    and (c.owner_id = auth.uid() or exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = auth.uid() and m.role in ('owner','admin')))))
  with check (author_id = auth.uid() and exists (select 1 from channels c where c.id = channel_id
    and (c.owner_id = auth.uid() or exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = auth.uid() and m.role in ('owner','admin')))));

drop policy if exists channel_reactions_select on public.channel_reactions;
create policy channel_reactions_select on public.channel_reactions for select to authenticated using (true);
drop policy if exists channel_reactions_write on public.channel_reactions;
create policy channel_reactions_write on public.channel_reactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 8. Calls.
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (initiator_id = auth.uid() or exists (select 1 from call_participants p where p.call_id = id and p.user_id = auth.uid()) or public.is_admin());
drop policy if exists calls_insert on public.calls;
create policy calls_insert on public.calls for insert to authenticated with check (initiator_id = auth.uid());
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update to authenticated
  using (initiator_id = auth.uid() or exists (select 1 from call_participants p where p.call_id = id and p.user_id = auth.uid()) or public.is_admin());

drop policy if exists call_participants_select on public.call_participants;
create policy call_participants_select on public.call_participants for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from calls c where c.id = call_id and c.initiator_id = auth.uid()));
drop policy if exists call_participants_write on public.call_participants;
create policy call_participants_write on public.call_participants for all to authenticated
  using (user_id = auth.uid() or exists (select 1 from calls c where c.id = call_id and c.initiator_id = auth.uid()))
  with check (user_id = auth.uid() or exists (select 1 from calls c where c.id = call_id and c.initiator_id = auth.uid()));

drop policy if exists call_events_select on public.call_events;
create policy call_events_select on public.call_events for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and (c.initiator_id = auth.uid()
    or exists (select 1 from call_participants p where p.call_id = c.id and p.user_id = auth.uid()))));
drop policy if exists call_events_insert on public.call_events;
create policy call_events_insert on public.call_events for insert to authenticated
  with check (exists (select 1 from calls c where c.id = call_id and (c.initiator_id = auth.uid()
    or exists (select 1 from call_participants p where p.call_id = c.id and p.user_id = auth.uid()))));

-- 9. Notifications, devices, security.
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists devices_own on public.devices;
create policy devices_own on public.devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists security_own on public.security_events;
create policy security_own on public.security_events for select to authenticated
  using (user_id = auth.uid() or public.has_admin_permission('security.read'));
drop policy if exists security_insert on public.security_events;
create policy security_insert on public.security_events for insert to authenticated with check (user_id = auth.uid());

-- 10. Administration.
drop policy if exists admin_roles_read on public.admin_roles;
create policy admin_roles_read on public.admin_roles for select to authenticated using (public.is_admin());
drop policy if exists admin_roles_write on public.admin_roles;
create policy admin_roles_write on public.admin_roles for all to authenticated
  using (public.has_admin_permission('settings.write')) with check (public.has_admin_permission('settings.write'));

drop policy if exists admin_user_roles_read on public.admin_user_roles;
create policy admin_user_roles_read on public.admin_user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists admin_user_roles_write on public.admin_user_roles;
create policy admin_user_roles_write on public.admin_user_roles for all to authenticated
  using (public.has_admin_permission('*')) with check (public.has_admin_permission('*'));

drop policy if exists reports_select on public.moderation_reports;
create policy reports_select on public.moderation_reports for select to authenticated
  using (reporter_id = auth.uid() or public.has_admin_permission('reports.read'));
drop policy if exists reports_insert on public.moderation_reports;
create policy reports_insert on public.moderation_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists reports_update on public.moderation_reports;
create policy reports_update on public.moderation_reports for update to authenticated
  using (public.has_admin_permission('reports.write')) with check (public.has_admin_permission('reports.write'));

drop policy if exists moderation_actions_admin on public.moderation_actions;
create policy moderation_actions_admin on public.moderation_actions for all to authenticated
  using (public.has_admin_permission('reports.write')) with check (public.has_admin_permission('reports.write'));

drop policy if exists audit_read on public.admin_audit_logs;
create policy audit_read on public.admin_audit_logs for select to authenticated using (public.has_admin_permission('audit.read'));
drop policy if exists audit_insert on public.admin_audit_logs;
create policy audit_insert on public.admin_audit_logs for insert to authenticated
  with check (public.is_admin() and admin_id = auth.uid());
drop policy if exists audit_no_update on public.admin_audit_logs;
create policy audit_no_update on public.admin_audit_logs for update to authenticated using (false);

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to authenticated
  using (publish_at <= now() and (expires_at is null or expires_at > now()));
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using (public.has_admin_permission('settings.write')) with check (public.has_admin_permission('settings.write'));

drop policy if exists platform_settings_admin on public.platform_settings;
create policy platform_settings_admin on public.platform_settings for all to authenticated
  using (public.has_admin_permission('settings.write')) with check (public.has_admin_permission('settings.write'));

-- 11. Storage ownership and privacy.
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists profile_photos_read on storage.objects;
create policy profile_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and public.can_view_avatar(((storage.foldername(name))[1])::uuid, auth.uid()));
drop policy if exists profile_photos_write on storage.objects;
create policy profile_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_photos_update on storage.objects;
create policy profile_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists profile_photos_delete on storage.objects;
create policy profile_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists media_member_read on storage.objects;
create policy media_member_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_conversation_member(((storage.foldername(name))[1])::uuid));
drop policy if exists media_member_write on storage.objects;
create policy media_member_write on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_conversation_member(((storage.foldername(name))[1])::uuid));

drop policy if exists status_media_read on storage.objects;
create policy status_media_read on storage.objects for select to authenticated
  using (bucket_id = 'status-media' and public.can_view_status(((storage.foldername(name))[1])::uuid));
drop policy if exists status_media_write on storage.objects;
create policy status_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'status-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists channel_media_read on storage.objects;
create policy channel_media_read on storage.objects for select using (bucket_id = 'channel-media');
drop policy if exists channel_media_write on storage.objects;
create policy channel_media_write on storage.objects for insert to authenticated
  with check (bucket_id = 'channel-media');

-- 12. Realtime private topics.
drop policy if exists realtime_conversation_topics on realtime.messages;
create policy realtime_conversation_topics on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'conversation:%'
    and public.is_conversation_member(substring(realtime.topic() from 14)::uuid)
  );
drop policy if exists realtime_presence_topics on realtime.messages;
create policy realtime_presence_topics on realtime.messages for select to authenticated
  using (realtime.topic() = 'presence:global');
drop policy if exists realtime_write_topics on realtime.messages;
create policy realtime_write_topics on realtime.messages for insert to authenticated
  with check (
    realtime.topic() = 'presence:global'
    or (realtime.topic() like 'conversation:%'
        and public.is_conversation_member(substring(realtime.topic() from 14)::uuid))
  );
drop policy if exists realtime_user_topic_read on realtime.messages;
create policy realtime_user_topic_read on realtime.messages for select to authenticated
  using (realtime.topic() = 'user:' || auth.uid()::text);
drop policy if exists realtime_user_topic_write on realtime.messages;
create policy realtime_user_topic_write on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'user:%');

-- Status view rows drive status-ring updates in the chat list and profiles.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.status_views;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Verify:
-- select schemaname, tablename, rowsecurity from pg_tables
-- where schemaname in ('public','storage','realtime') and rowsecurity = false;
