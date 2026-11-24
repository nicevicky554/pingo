/*
# PINGO — initial schema (core messaging, status, channels, calls, admin)

1. New Tables
- profiles, user_settings, contacts, blocks
- conversations, conversation_members, messages, message_receipts,
  message_reactions, message_deletions, message_pins
- status_updates, status_views, status_reactions, status_audience
- communities, community_members, community_groups
- channels, channel_members, channel_posts, channel_reactions
- calls, call_participants, call_events
- notifications, push_tokens, devices, security_events
- admin_roles, admin_user_roles, moderation_reports, moderation_actions,
  admin_audit_logs, announcements, platform_settings

2. Views
- public_profiles (privacy-aware profile projection)
- conversation_list (security_invoker, RLS enforced)

3. Security
- RLS enabled on every table; per-verb ownership/membership policies.
- Storage buckets: avatars, profile-photos, media, status-media, channel-media
  with owner/member scoped storage policies.
- Realtime publication + realtime.messages topic policies.
- All tables are created BEFORE the helper functions and views that reference
  them, so SQL-language function bodies validate on creation.
*/

create extension if not exists "pgcrypto";

do $$ begin create type public.visibility as enum ('everyone','contacts','contacts_except','nobody'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('owner','admin','member'); exception when duplicate_object then null; end $$;
do $$ begin create type public.receipt_status as enum ('delivered','read'); exception when duplicate_object then null; end $$;
do $$ begin create type public.report_status as enum ('open','reviewing','resolved','dismissed'); exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '',
  about text not null default '',
  phone text,
  avatar_path text,
  public_avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','suspended','restricted')),
  suspended_reason text
);
create index if not exists profiles_username_idx on public.profiles (lower(username));

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  accent text not null default 'teal',
  wallpaper text not null default 'dots',
  font_size text not null default 'md' check (font_size in ('sm','md','lg')),
  message_preview boolean not null default true,
  read_receipts boolean not null default true,
  online_visibility public.visibility not null default 'everyone',
  last_seen_visibility public.visibility not null default 'everyone',
  avatar_visibility public.visibility not null default 'everyone',
  status_visibility public.visibility not null default 'contacts',
  who_can_add_to_groups public.visibility not null default 'everyone',
  notifications jsonb not null default '{"messages":true,"groups":true,"calls":true,"sound":true}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  local_photo_url text,
  created_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type in ('direct','group')),
  title text,
  description text,
  avatar_url text,
  created_by uuid references public.profiles(id) on delete set null,
  announce_only boolean not null default false,
  member_permissions jsonb not null default '{"send_messages":true,"edit_info":false,"add_members":true,"approve_members":false,"manage_messages":false}'::jsonb,
  disappear_seconds integer check (disappear_seconds is null or disappear_seconds between 60 and 31536000),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists conversations_last_message_idx on public.conversations (last_message_at desc);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  archived boolean not null default false,
  pinned boolean not null default false,
  approved boolean not null default true,
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  kind text not null default 'text' check (kind in ('text','image','video','file','voice','system')),
  attachment_path text,
  attachment_name text,
  attachment_size bigint,
  attachment_mime text,
  duration_seconds integer,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_body_search_idx on public.messages using gin (to_tsvector('simple', body));

create table if not exists public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.receipt_status not null default 'delivered',
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_receipts_user_idx on public.message_receipts (user_id);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.message_deletions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.message_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

create table if not exists public.status_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','image','video')),
  body text,
  media_path text,
  background text default '#126B78',
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists status_user_idx on public.status_updates (user_id, expires_at desc);

create table if not exists public.status_views (
  status_id uuid not null references public.status_updates(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

create table if not exists public.status_reactions (
  status_id uuid not null references public.status_updates(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (status_id, user_id)
);

create table if not exists public.status_audience (
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  rule text not null check (rule in ('only','except')),
  primary key (user_id, viewer_id, rule)
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_groups (
  community_id uuid not null references public.communities(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  primary key (community_id, conversation_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  name text not null,
  description text,
  avatar_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (channel_id, user_id)
);

create table if not exists public.channel_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text,
  media_path text,
  pinned boolean not null default false,
  scheduled_for timestamptz,
  published_at timestamptz default now(),
  views integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists channel_posts_idx on public.channel_posts (channel_id, created_at desc);

create table if not exists public.channel_reactions (
  post_id uuid not null references public.channel_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  primary key (post_id, user_id, emoji)
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'voice' check (kind in ('voice','video')),
  status text not null default 'ringing' check (status in ('ringing','accepted','declined','missed','cancelled','failed','ended')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  end_reason text
);
create index if not exists calls_initiator_idx on public.calls (initiator_id, started_at desc);

create table if not exists public.call_participants (
  call_id uuid not null references public.calls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'invited' check (state in ('invited','joined','left','declined','missed')),
  joined_at timestamptz,
  left_at timestamptz,
  primary key (call_id, user_id)
);

create table if not exists public.call_events (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls(id) on delete cascade,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('web','android','ios')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  platform text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  event text not null,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_roles (
  role text primary key,
  label text not null,
  permissions text[] not null default '{}'
);

insert into public.admin_roles (role, label, permissions) values
  ('super_admin','Super admin', array['*']),
  ('system_admin','System admin', array['analytics.read','infrastructure.read','settings.write','users.read']),
  ('security_admin','Security admin', array['users.read','users.suspend','security.read','audit.read','reports.read']),
  ('moderator','Moderator', array['users.read','reports.read','reports.write','groups.read','channels.read','audit.read']),
  ('support_agent','Support agent', array['users.read','users.restore','reports.read']),
  ('analytics_viewer','Analytics viewer', array['analytics.read'])
on conflict (role) do nothing;

create table if not exists public.admin_user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null references public.admin_roles(role) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user','message','group','channel','community')),
  target_id text not null,
  reason text not null,
  details text,
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists reports_status_idx on public.moderation_reports (status, created_at desc);

create table if not exists public.moderation_actions (
  id bigint generated always as identity primary key,
  report_id uuid references public.moderation_reports(id) on delete set null,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  result text not null default 'success',
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.admin_audit_logs (created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all',
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (created after all tables so bodies validate)
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked(owner uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks b
    where (b.blocker_id = owner and b.blocked_id = viewer)
       or (b.blocker_id = viewer and b.blocked_id = owner)
  );
$$;

create or replace function public.is_contact(owner uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contacts c where c.owner_id = owner and c.contact_id = viewer);
$$;

create or replace function public.shares_group_with(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members m1
    join conversation_members m2 on m1.conversation_id = m2.conversation_id
    where m1.user_id = a and m2.user_id = b
  );
$$;

create or replace function public.can_view_avatar(owner uuid, viewer uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v public.visibility;
begin
  if owner = viewer then return true; end if;
  if viewer is null then return false; end if;
  if public.is_blocked(owner, viewer) then return false; end if;
  select avatar_visibility into v from user_settings where user_id = owner;
  if v is null then return false; end if;
  if v = 'everyone' then return true; end if;
  if v = 'nobody' then return false; end if;
  return public.is_contact(owner, viewer);
end $$;

create or replace function public.can_view_presence(owner uuid, viewer uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v public.visibility;
begin
  if owner = viewer then return true; end if;
  if viewer is null or public.is_blocked(owner, viewer) then return false; end if;
  select online_visibility into v from user_settings where user_id = owner;
  if v is null then return false; end if;
  if v = 'everyone' then return true; end if;
  if v = 'nobody' then return false; end if;
  return public.is_contact(owner, viewer) or public.shares_group_with(owner, viewer);
end $$;

create or replace function public.is_conversation_member(conv uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv and user_id = uid);
$$;

create or replace function public.is_conversation_admin(conv uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conv and user_id = uid and role in ('owner','admin')
  );
$$;

create or replace function public.can_view_status(owner uuid, viewer uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v public.visibility;
begin
  if owner = viewer then return true; end if;
  if viewer is null or public.is_blocked(owner, viewer) then return false; end if;
  select status_visibility into v from user_settings where user_id = owner;
  if v is null then return false; end if;
  if v = 'everyone' then return true; end if;
  if v = 'nobody' then return false; end if;
  if v = 'contacts' then return public.is_contact(owner, viewer); end if;
  if exists (select 1 from status_audience a where a.user_id = owner and a.viewer_id = viewer and a.rule = 'only') then return true; end if;
  return public.is_contact(owner, viewer)
    and not exists (select 1 from status_audience a where a.user_id = owner and a.viewer_id = viewer and a.rule = 'except');
end $$;

create or replace function public.is_community_member(community uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members where community_id = community and user_id = uid);
$$;

create or replace function public.is_channel_member(channel uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from channel_members where channel_id = channel and user_id = uid);
$$;

create or replace function public.has_admin_permission(permission text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_user_roles ur
    join admin_roles r on r.role = ur.role
    where ur.user_id = uid
      and ('*' = any(r.permissions) or permission = any(r.permissions))
  );
$$;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_user_roles where user_id = uid);
$$;

create or replace function public.purge_expired_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare removed integer;
begin
  delete from messages where expires_at is not null and expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end $$;

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create or replace function public.start_direct_conversation(other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare existing uuid; conv uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if other_user = auth.uid() then raise exception 'cannot message yourself'; end if;
  if exists (select 1 from blocks where (blocker_id = auth.uid() and blocked_id = other_user)
    or (blocker_id = other_user and blocked_id = auth.uid())) then
    raise exception 'contact unavailable';
  end if;
  select c.id into existing
  from conversations c
  where c.type = 'direct'
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = auth.uid())
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = other_user)
    and (select count(*) from conversation_members m where m.conversation_id = c.id) = 2
  limit 1;
  if existing is not null then return existing; end if;
  insert into conversations (type, created_by) values ('direct', auth.uid()) returning id into conv;
  insert into conversation_members (conversation_id, user_id, role) values
    (conv, auth.uid(), 'owner'), (conv, other_user, 'member');
  return conv;
end $$;

create or replace function public.create_group(group_title text, member_ids uuid[], group_avatar text default null, group_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv uuid; member uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(group_title), '') = '' then raise exception 'group name required'; end if;
  insert into conversations (type, title, description, avatar_url, created_by)
  values ('group', trim(group_title), group_description, group_avatar, auth.uid()) returning id into conv;
  insert into conversation_members (conversation_id, user_id, role) values (conv, auth.uid(), 'owner');
  foreach member in array member_ids loop
    if member <> auth.uid() then
      insert into conversation_members (conversation_id, user_id, role) values (conv, member, 'member')
      on conflict do nothing;
    end if;
  end loop;
  insert into messages (conversation_id, sender_id, kind, body) values (conv, auth.uid(), 'system', 'created the group');
  return conv;
end $$;

create or replace function public.claim_super_admin()
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from admin_user_roles) then raise exception 'an administrator already exists'; end if;
  insert into admin_user_roles (user_id, role) values (auth.uid(), 'super_admin');
  insert into admin_audit_logs (admin_id, action, target_type, target_id, reason)
  values (auth.uid(), 'admin.bootstrap', 'admin_user', auth.uid(), 'First administrator bootstrap');
  return true;
end $$;

create or replace function public.admin_dashboard()
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  select json_build_object(
    'users', (select count(*) from profiles),
    'active_users', (select count(*) from profiles where status = 'active'),
    'suspended_users', (select count(*) from profiles where status <> 'active'),
    'new_users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'messages', (select count(*) from messages where deleted_at is null),
    'messages_24h', (select count(*) from messages where created_at > now() - interval '24 hours'),
    'groups', (select count(*) from conversations where type = 'group'),
    'communities', (select count(*) from communities),
    'channels', (select count(*) from channels),
    'statuses', (select count(*) from status_updates where expires_at > now()),
    'calls', (select count(*) from calls),
    'calls_completed', (select count(*) from calls where status = 'ended'),
    'reports_open', (select count(*) from moderation_reports where status in ('open','reviewing')),
    'announcements', (select count(*) from announcements)
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles as
select
  p.id,
  p.username,
  p.display_name,
  p.about,
  p.created_at,
  p.status,
  case when p.id = auth.uid() or public.can_view_avatar(p.id, auth.uid())
       then p.avatar_path else null end as avatar_path,
  p.public_avatar_url,
  s.online_visibility,
  s.last_seen_visibility,
  (p.status = 'active' and not public.is_blocked(p.id, auth.uid())) as reachable
from profiles p
join user_settings s on s.user_id = p.id;

create or replace view public.conversation_list
with (security_invoker = true) as
select
  c.id,
  c.type,
  c.title,
  c.description,
  c.avatar_url,
  c.last_message_at,
  c.announce_only,
  c.disappear_seconds,
  cm.user_id,
  cm.role,
  cm.last_read_at,
  cm.muted,
  cm.archived,
  cm.pinned,
  coalesce((
    select count(*) from messages m
    where m.conversation_id = c.id and m.created_at > cm.last_read_at
      and m.sender_id <> cm.user_id and m.deleted_at is null
  ), 0) as unread,
  (
    select json_build_object(
      'id', m.id, 'body', m.body, 'kind', m.kind, 'created_at', m.created_at,
      'sender_id', m.sender_id, 'deleted_at', m.deleted_at
    )
    from messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc limit 1
  ) as last_message
from conversations c
join conversation_members cm on cm.conversation_id = c.id;

grant select on public.public_profiles to authenticated;
grant select on public.conversation_list to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.phone
  ) on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.contacts enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_receipts enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_deletions enable row level security;
alter table public.message_pins enable row level security;
alter table public.status_updates enable row level security;
alter table public.status_views enable row level security;
alter table public.status_reactions enable row level security;
alter table public.status_audience enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_groups enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.channel_posts enable row level security;
alter table public.channel_reactions enable row level security;
alter table public.calls enable row level security;
alter table public.call_participants enable row level security;
alter table public.call_events enable row level security;
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.devices enable row level security;
alter table public.security_events enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.announcements enable row level security;
alter table public.platform_settings enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and status = 'active');
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

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (is_public or owner_id = auth.uid() or public.is_channel_member(id) or public.is_admin());
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists channel_members_select on public.channel_members;
create policy channel_members_select on public.channel_members for select to authenticated using (true);
drop policy if exists channel_members_write on public.channel_members;
create policy channel_members_write on public.channel_members for all to authenticated
  using (user_id = auth.uid() or exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid()))
  with check (user_id = auth.uid() or exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid()));

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

drop policy if exists admin_roles_read on public.admin_roles;
create policy admin_roles_read on public.admin_roles for select to authenticated
  using (public.is_admin());
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
create policy reports_insert on public.moderation_reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists reports_update on public.moderation_reports;
create policy reports_update on public.moderation_reports for update to authenticated
  using (public.has_admin_permission('reports.write')) with check (public.has_admin_permission('reports.write'));

drop policy if exists moderation_actions_admin on public.moderation_actions;
create policy moderation_actions_admin on public.moderation_actions for all to authenticated
  using (public.has_admin_permission('reports.write')) with check (public.has_admin_permission('reports.write'));

drop policy if exists audit_read on public.admin_audit_logs;
create policy audit_read on public.admin_audit_logs for select to authenticated
  using (public.has_admin_permission('audit.read'));
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

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true),
  ('profile-photos','profile-photos', false),
  ('media','media', false),
  ('status-media','status-media', false),
  ('channel-media','channel-media', true)
on conflict (id) do nothing;

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

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.message_receipts; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.conversation_members; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.conversations; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.status_updates; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.calls; exception when duplicate_object then null; end;
  end if;
end $$;

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
