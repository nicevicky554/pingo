-- PINGO — real channel post view counts.
--
-- A view is recorded once per authenticated user per post. The counter on
-- channel_posts is only changed by a security-definer function, so subscribers
-- cannot forge view counts and admins do not have to update posts from the
-- browser.

create table if not exists public.channel_post_views (
  post_id uuid not null references public.channel_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.channel_post_views enable row level security;

create or replace function public.pingo_record_channel_views(post_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or post_ids is null then
    return;
  end if;

  with fresh as (
    insert into public.channel_post_views (post_id, user_id)
    select candidate, auth.uid()
    from unnest(post_ids) as candidate
    where exists (
      select 1 from public.channel_posts p where p.id = candidate
    )
    on conflict do nothing
    returning post_id
  )
  update public.channel_posts p
  set views = p.views + counted.total
  from (
    select post_id, count(*)::integer as total
    from fresh
    group by post_id
  ) counted
  where p.id = counted.post_id;
end;
$$;

revoke all on function public.pingo_record_channel_views(uuid[]) from public;
grant execute on function public.pingo_record_channel_views(uuid[]) to authenticated;
