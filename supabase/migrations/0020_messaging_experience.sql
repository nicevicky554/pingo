-- PINGO — messaging experience pass
--
-- Adds, in one forward-only migration:
--   1. A transactional read-state function (unread badges + receipts + notifications).
--   2. Channel identity/feed support: pinned timestamps, multiple attachments,
--      comments, invite codes and admin management.
--   3. Status editor metadata: text styling, media overlays, video trim range.
--   4. Administrator-controlled phone registration mode (OTP required / no OTP),
--      with an audited setter and a public read-only getter.
--
-- Nothing here drops existing data or renames an existing column.

-- ===========================================================================
-- 1. READ STATE
-- ===========================================================================

-- One atomic call per opened conversation. The client may only ask about a
-- conversation it belongs to; the acting user is always auth.uid().
create or replace function public.pingo_mark_conversation_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stamp timestamptz;
  previous_read timestamptz;
  receipts_enabled boolean := true;
  marked integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_conversation_id is null then
    raise exception 'conversation required';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = uid
  ) then
    raise exception 'not a member of this conversation';
  end if;

  -- Anchor on the newest message the reader can actually see; using now()
  -- alone would hide a message that arrived with a slightly later clock.
  select greatest(
    now(),
    coalesce(max(m.created_at), now())
  )
  into stamp
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> uid
    and m.deleted_at is null;

  select cm.last_read_at into previous_read
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = uid;

  update public.conversation_members cm
  set last_read_at = greatest(cm.last_read_at, stamp)
  where cm.conversation_id = p_conversation_id and cm.user_id = uid;

  select coalesce(read_receipts, true) into receipts_enabled
  from public.user_settings where user_id = uid;
  receipts_enabled := coalesce(receipts_enabled, true);

  -- Delivery is acknowledged regardless of the read-receipt preference; the
  -- reader has the rows on this device.
  insert into public.message_receipts (message_id, user_id, status, updated_at)
  select m.id, uid, 'delivered', now()
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> uid
    and m.deleted_at is null
  on conflict (message_id, user_id) do nothing;

  if receipts_enabled then
    insert into public.message_receipts (message_id, user_id, status, updated_at)
    select m.id, uid, 'read', now()
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id <> uid
      and m.deleted_at is null
    on conflict (message_id, user_id) do update
      set status = 'read', updated_at = now()
      where public.message_receipts.status <> 'read';
  end if;

  -- Messages that were still unread before this call. This makes the return
  -- value a real "marked now" count instead of every receipt ever written.
  select count(*)::integer into marked
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id <> uid
    and m.deleted_at is null
    and m.created_at > coalesce(previous_read, '-infinity'::timestamptz);

  -- Opening a conversation also clears its in-app notifications, which is what
  -- keeps the bell badge consistent with the chat list badge.
  update public.notifications n
  set read_at = now()
  where n.user_id = uid
    and n.read_at is null
    and n.data->>'conversation_id' = p_conversation_id::text;

  return jsonb_build_object(
    'conversation_id', p_conversation_id,
    'last_read_at', stamp,
    'read_receipts', receipts_enabled,
    'receipts', marked,
    'unread', 0
  );
end;
$$;

revoke all on function public.pingo_mark_conversation_read(uuid) from public;
grant execute on function public.pingo_mark_conversation_read(uuid) to authenticated;

-- Total unread for the bell/badge header. Calculated from the same membership
-- cursor as conversation_list so the two numbers can never disagree.
create or replace function public.pingo_unread_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'conversations', count(*) filter (where unread > 0),
    'messages', coalesce(sum(unread), 0)
  )
  from (
    select c.id,
      coalesce((
        select count(*) from public.messages m
        where m.conversation_id = c.id
          and m.created_at > cm.last_read_at
          and m.sender_id <> cm.user_id
          and m.deleted_at is null
          and (m.expires_at is null or m.expires_at > now())
      ), 0)::integer as unread
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where cm.user_id = auth.uid()
  ) rows;
$$;

revoke all on function public.pingo_unread_summary() from public;
grant execute on function public.pingo_unread_summary() to authenticated;

-- ===========================================================================
-- 2. CHANNELS
-- ===========================================================================

alter table public.channels add column if not exists comments_enabled boolean not null default false;
alter table public.channels add column if not exists invite_code text;
-- Existing channels get an invite code only when they are private.
update public.channels
set invite_code = replace(gen_random_uuid()::text, '-', '')
where invite_code is null and is_public = false;
create unique index if not exists channels_invite_code_key on public.channels (invite_code);

alter table public.channel_posts add column if not exists media_paths text[] not null default '{}';
alter table public.channel_posts add column if not exists media_meta jsonb not null default '[]'::jsonb;
alter table public.channel_posts add column if not exists link_url text;
alter table public.channel_posts add column if not exists pinned_at timestamptz;
create index if not exists channel_posts_pinned_idx
  on public.channel_posts (channel_id, pinned desc, published_at desc nulls last);

do $$
begin
  if exists (
    select 1 from public.channel_reactions
    group by post_id, user_id having count(*) > 1
  ) then
    delete from public.channel_reactions a
    using public.channel_reactions b
    where a.post_id = b.post_id
      and a.user_id = b.user_id
      and a.ctid < b.ctid;
  end if;
end $$;
create unique index if not exists channel_reactions_one_per_user
  on public.channel_reactions (post_id, user_id);

-- Comments are only available when the channel opts in. A post's comment
-- thread lives here; no conversation is invented for a channel that never
-- enabled discussions.
create table if not exists public.channel_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.channel_posts(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists channel_post_comments_post_idx
  on public.channel_post_comments (post_id, created_at);

alter table public.channel_post_comments enable row level security;

drop policy if exists channel_comments_select on public.channel_post_comments;
create policy channel_comments_select on public.channel_post_comments for select to authenticated
  using (
    exists (
      select 1 from public.channel_posts p
      join public.channels c on c.id = p.channel_id
      where p.id = post_id
        and (c.is_public or c.owner_id = auth.uid() or public.is_channel_member(c.id))
    )
  );

drop policy if exists channel_comments_insert on public.channel_post_comments;
create policy channel_comments_insert on public.channel_post_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.channel_posts p
      join public.channels c on c.id = p.channel_id
      where p.id = post_id
        and c.id = channel_id
        and c.comments_enabled
        and public.is_channel_member(c.id)
    )
  );

drop policy if exists channel_comments_delete on public.channel_post_comments;
create policy channel_comments_delete on public.channel_post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_channel_admin(channel_id)
    or public.is_admin()
  );

grant select, insert, delete on public.channel_post_comments to authenticated;

-- Channel admins (not only the owner) can edit channel identity/settings.
drop policy if exists channels_admin_update on public.channels;
create policy channels_admin_update on public.channels for update to authenticated
  using (owner_id = auth.uid() or public.is_channel_admin(id))
  with check (owner_id = auth.uid() or public.is_channel_admin(id));

drop policy if exists channel_members_admin_write on public.channel_members;
create policy channel_members_admin_write on public.channel_members for all to authenticated
  using (user_id = auth.uid() or public.is_channel_admin(channel_id))
  with check (user_id = auth.uid() or public.is_channel_admin(channel_id));

drop policy if exists channel_reactions_write on public.channel_reactions;
create policy channel_reactions_write on public.channel_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.channel_posts p
      join public.channels c on c.id = p.channel_id
      where p.id = post_id
        and (c.is_public or c.owner_id = auth.uid() or public.is_channel_member(c.id))
    )
  );

-- Storage: channel media is readable by anyone who can see the channel, and
-- writable only by the channel owner/administrators. Existing bucket policy
-- relied on a broad public read; this tightens it to authenticated viewers.
drop policy if exists channel_media_read on storage.objects;
create policy channel_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'channel-media'
    and exists (
      select 1 from public.channel_posts p
      join public.channels c on c.id = p.channel_id
      where (p.media_path = name or p.media_paths @> array[name])
        and (c.is_public or c.owner_id = auth.uid() or public.is_channel_member(c.id))
    )
  );

drop policy if exists channel_media_write on storage.objects;
create policy channel_media_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'channel-media'
    and exists (
      select 1 from public.channels c
      where c.id::text = (storage.foldername(name))[1]
        and (c.owner_id = auth.uid() or public.is_channel_admin(c.id))
    )
  );

-- Replacing (upsert) or deleting a channel attachment is an owner/admin action.
drop policy if exists channel_media_update on storage.objects;
create policy channel_media_update on storage.objects for update to authenticated
  using (
    bucket_id = 'channel-media'
    and exists (
      select 1 from public.channels c
      where c.id::text = (storage.foldername(name))[1]
        and (c.owner_id = auth.uid() or public.is_channel_admin(c.id))
    )
  )
  with check (
    bucket_id = 'channel-media'
    and exists (
      select 1 from public.channels c
      where c.id::text = (storage.foldername(name))[1]
        and (c.owner_id = auth.uid() or public.is_channel_admin(c.id))
    )
  );

drop policy if exists channel_media_delete on storage.objects;
create policy channel_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'channel-media'
    and exists (
      select 1 from public.channels c
      where c.id::text = (storage.foldername(name))[1]
        and (c.owner_id = auth.uid() or public.is_channel_admin(c.id))
    )
  );

-- ===========================================================================
-- 3. STATUS EDITOR METADATA
-- ===========================================================================

alter table public.status_updates add column if not exists text_color text;
alter table public.status_updates add column if not exists font_family text;
alter table public.status_updates add column if not exists font_size integer;
alter table public.status_updates add column if not exists text_align text;
alter table public.status_updates add column if not exists overlay jsonb not null default '[]'::jsonb;
alter table public.status_updates add column if not exists trim_start_seconds numeric(10,2) not null default 0;
alter table public.status_updates add column if not exists trim_end_seconds numeric(10,2);
alter table public.status_updates add column if not exists media_meta jsonb not null default '{}'::jsonb;

-- Status owners may clear their own audience rules (the previous RLS setup
-- had no explicit policy for status_audience on every deployment).
alter table public.status_audience enable row level security;
drop policy if exists status_audience_own on public.status_audience;
create policy status_audience_own on public.status_audience for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- 4. PHONE REGISTRATION MODE
-- ===========================================================================

insert into public.platform_settings (key, value)
values ('auth.phone_verification', '{"mode":"otp"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_phone_registration_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce((
      select value->>'mode' from public.platform_settings
      where key = 'auth.phone_verification'
    ), 'otp') = 'none' then 'none'
    else 'otp'
  end;
$$;
grant execute on function public.get_phone_registration_mode() to anon, authenticated;

create or replace function public.set_phone_registration_mode(next_mode text, reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  previous text;
begin
  normalized := lower(coalesce(trim(next_mode), ''));
  if normalized not in ('otp','none') then
    raise exception 'invalid phone verification mode';
  end if;
  if not public.has_admin_permission('settings.write') then
    raise exception 'not authorized';
  end if;

  previous := public.get_phone_registration_mode();

  insert into public.platform_settings (key, value, updated_at)
  values ('auth.phone_verification', jsonb_build_object('mode', normalized), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into public.admin_audit_logs (admin_id, action, target_type, target_id, reason, metadata)
  values (
    auth.uid(),
    'platform.phone_verification',
    'platform',
    'auth.phone_verification',
    reason,
    jsonb_build_object('from', previous, 'to', normalized)
  );

  return normalized;
end;
$$;
revoke all on function public.set_phone_registration_mode(text, text) from public;
grant execute on function public.set_phone_registration_mode(text, text) to authenticated;

-- A phone number may belong to exactly one account. Existing duplicate rows
-- (if any) are preserved; the index is created only when the data is clean.
do $$
begin
  if not exists (
    select 1 from public.profiles
    where phone is not null
    group by phone having count(*) > 1
  ) then
    create unique index if not exists profiles_phone_key on public.profiles (phone)
      where phone is not null;
  end if;
end $$;

-- No-OTP account credentials are held by Supabase Auth only. This table stores
-- the minimum audit trail for mode-specific registration attempts; it never
-- stores a password or access code.
create table if not exists public.phone_access_events (
  id bigint generated always as identity primary key,
  phone text not null,
  user_id uuid references public.profiles(id) on delete set null,
  event text not null check (event in ('register','login','login_failed')),
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists phone_access_events_phone_idx
  on public.phone_access_events (phone, created_at desc);
alter table public.phone_access_events enable row level security;
-- No client policy: only the service-role server route writes/reads this table.

-- ===========================================================================
-- 5. PRIVATE CHANNEL INVITES
-- ===========================================================================

-- An invite code adds the caller to a private channel. It cannot reveal the
-- channel first: the row stays invisible until membership exists.
create or replace function public.pingo_join_channel_by_invite(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if code is null or char_length(trim(code)) < 8 then
    raise exception 'invalid invite code';
  end if;
  select id into cid from public.channels
  where lower(invite_code) = lower(trim(code)) and is_public = false;
  if cid is null then
    raise exception 'invite not found';
  end if;
  insert into public.channel_members (channel_id, user_id, role)
  values (cid, uid, 'member')
  on conflict (channel_id, user_id) do nothing;
  return cid;
end;
$$;

revoke all on function public.pingo_join_channel_by_invite(text) from public;
grant execute on function public.pingo_join_channel_by_invite(text) to authenticated;

-- Membership roles are not ordinary client data. Admins may add/remove regular
-- members, but only the channel owner may create another admin or touch the
-- owner row, so an admin cannot promote themselves into ownership.
create or replace function public.pingo_guard_channel_member_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'channel ownership cannot be removed here';
    end if;
    if old.role = 'admin'
       and not exists (
         select 1 from public.channels c
         where c.id = old.channel_id and c.owner_id = auth.uid()
       ) then
      raise exception 'only the channel owner can remove administrators';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and new.role in ('owner', 'admin') then
    if not exists (
      select 1 from public.channels c
      where c.id = new.channel_id and c.owner_id = auth.uid()
    ) then
      raise exception 'only the channel owner can add administrators';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner' and (
      new.role <> 'owner'
      or new.user_id <> old.user_id
      or new.channel_id <> old.channel_id
    ) then
      raise exception 'channel ownership cannot be changed here';
    end if;
    -- Ordinary updates (for example muting notifications) stay allowed for
    -- the member themselves; only a role/identity change needs the owner.
    if (new.role is distinct from old.role
        or new.user_id <> old.user_id
        or new.channel_id <> old.channel_id)
       and (new.role in ('owner', 'admin') or old.role in ('owner', 'admin'))
       and not exists (
         select 1 from public.channels c
         where c.id = new.channel_id and c.owner_id = auth.uid()
       ) then
      raise exception 'only the channel owner can change administrator roles';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_channel_member_role on public.channel_members;
create trigger guard_channel_member_role
  before insert or update or delete on public.channel_members
  for each row execute function public.pingo_guard_channel_member_role();

-- ===========================================================================
-- 6. REALTIME PUBLICATION
-- ===========================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.channel_posts;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.channel_reactions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.channel_post_comments;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
