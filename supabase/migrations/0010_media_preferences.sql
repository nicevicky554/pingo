-- PINGO — user media download preferences
alter table public.user_settings
  add column if not exists auto_download_media boolean not null default true,
  add column if not exists media_quality text not null default 'standard'
    check (media_quality in ('standard','high'));
