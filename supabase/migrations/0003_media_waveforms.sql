-- PINGO — voice-note waveforms
-- Apply after 0002_test_auth_calls_notifications.sql.

alter table public.messages
  add column if not exists waveform integer[];

comment on column public.messages.waveform is
  'Normalised 0-100 amplitude peaks generated from the real recorded audio.';

create index if not exists messages_expiry_idx
  on public.messages (expires_at)
  where expires_at is not null;
