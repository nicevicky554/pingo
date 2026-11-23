-- PINGO — view-once media
alter table public.messages
  add column if not exists view_once boolean not null default false;

create table if not exists public.message_views (
  message_id uuid not null references public.messages(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (message_id, viewer_id)
);

alter table public.message_views enable row level security;

-- Viewer records are written by the verified server endpoint. The sender can
-- read who opened the media; nobody else can enumerate it.
create policy "message views: sender reads"
  on public.message_views for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );
