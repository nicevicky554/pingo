-- PINGO — per-status-item media rotation (0/90/180/270 degrees)
alter table public.status_updates
  add column if not exists rotation smallint not null default 0
  check (rotation in (0, 90, 180, 270));
