/*
# PINGO — test auth settings, call signalling topics, notifications, waveforms, terms (combines 0002–0004)

1. platform_settings seed: auth.otp_mode = test; get/set_auth_mode functions (later dropped by 0008).
2. Realtime user:<id> topic policies for call signalling.
3. notify_new_message + notify_call_participant triggers inserting notifications.
4. messages.waveform integer[] column + partial index on expires_at.
5. profiles.terms_version / terms_accepted_at columns.
*/

insert into public.platform_settings (key, value)
values ('auth.otp_mode', '{"mode":"test"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_auth_mode()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value->>'mode' from platform_settings where key = 'auth.otp_mode'),
    'test'
  );
$$;
grant execute on function public.get_auth_mode() to anon, authenticated;

create or replace function public.set_auth_mode(next_mode text, reason text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  if next_mode not in ('test','live') then
    raise exception 'invalid auth mode';
  end if;
  if not public.has_admin_permission('settings.write') then
    raise exception 'not authorized';
  end if;
  insert into platform_settings (key, value, updated_at)
  values ('auth.otp_mode', jsonb_build_object('mode', next_mode), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into admin_audit_logs (admin_id, action, target_type, target_id, reason, metadata)
  values (auth.uid(), 'platform.auth_mode', 'platform', 'auth.otp_mode', reason,
          jsonb_build_object('mode', next_mode));
  return next_mode;
end $$;
grant execute on function public.set_auth_mode(text, text) to authenticated;

drop policy if exists realtime_user_topic_read on realtime.messages;
create policy realtime_user_topic_read on realtime.messages for select to authenticated
  using (realtime.topic() = 'user:' || auth.uid()::text);

drop policy if exists realtime_user_topic_write on realtime.messages;
create policy realtime_user_topic_write on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'user:%');

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender_name text;
begin
  select coalesce(nullif(display_name, ''), username, 'Someone')
    into sender_name from profiles where id = new.sender_id;

  insert into notifications (user_id, kind, title, body, data)
  select
    cm.user_id,
    'message',
    coalesce(sender_name, 'New message'),
    left(
      coalesce(
        nullif(new.body, ''),
        case new.kind
          when 'image' then 'Sent a photo'
          when 'video' then 'Sent a video'
          when 'voice' then 'Sent a voice note'
          when 'file' then 'Sent a file'
          else 'New message'
        end
      ),
      140
    ),
    jsonb_build_object(
      'conversation_id', new.conversation_id,
      'message_id', new.id,
      'sender_id', new.sender_id
    )
  from conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id
    and cm.muted = false;

  return new;
end $$;

drop trigger if exists on_message_created_notify on public.messages;
create trigger on_message_created_notify after insert on public.messages
  for each row execute function public.notify_new_message();

create or replace function public.notify_call_participant()
returns trigger language plpgsql security definer set search_path = public as $$
declare caller record; call_row record;
begin
  select * into call_row from calls where id = new.call_id;
  if call_row is null or new.user_id = call_row.initiator_id then
    return new;
  end if;
  select coalesce(nullif(display_name, ''), username, 'Someone') as name, avatar_path
    into caller from profiles where id = call_row.initiator_id;

  insert into notifications (user_id, kind, title, body, data)
  values (
    new.user_id,
    'call',
    coalesce(caller.name, 'Incoming call'),
    'Incoming ' || call_row.kind || ' call',
    jsonb_build_object(
      'call_id', new.call_id,
      'conversation_id', call_row.conversation_id,
      'call_kind', call_row.kind,
      'caller_id', call_row.initiator_id
    )
  );
  return new;
end $$;

drop trigger if exists on_call_participant_notify on public.call_participants;
create trigger on_call_participant_notify after insert on public.call_participants
  for each row execute function public.notify_call_participant();

alter table public.messages
  add column if not exists waveform integer[];

comment on column public.messages.waveform is
  'Normalised 0-100 amplitude peaks generated from the real recorded audio.';

create index if not exists messages_expiry_idx
  on public.messages (expires_at)
  where expires_at is not null;

alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Policy version the account holder actively accepted during profile setup.';
