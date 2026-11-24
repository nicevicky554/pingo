-- Text status styling (Part 6) and muted status authors (Part 5).
alter table public.status_updates
  add column if not exists font text not null default 'sans'
    check (font in ('sans','serif','mono','rounded')),
  add column if not exists text_align text not null default 'center'
    check (text_align in ('left','center','right')),
  add column if not exists text_color text not null default '#FFFFFF';

create table if not exists public.status_mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id)
);

alter table public.status_mutes enable row level security;

drop policy if exists "status_mutes_own" on public.status_mutes;
create policy "status_mutes_own" on public.status_mutes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
