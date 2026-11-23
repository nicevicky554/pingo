-- PINGO — verified users and channels
-- Badge fields are server-controlled. A trigger blocks ordinary users from
-- writing them even though they may update their own profile/channel row.

alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;

alter table public.channels
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;

create or replace view public.public_profiles as
select
  p.id,
  p.username,
  p.display_name,
  p.about,
  p.created_at,
  p.status,
  p.is_verified,
  case when p.id = auth.uid() or public.can_view_avatar(p.id, auth.uid())
       then p.avatar_path else null end as avatar_path,
  p.public_avatar_url,
  s.online_visibility,
  s.last_seen_visibility,
  (p.status = 'active' and not public.is_blocked(p.id, auth.uid())) as reachable
from profiles p
join user_settings s on s.user_id = p.id;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user','channel')),
  subject_id uuid not null,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists verification_status_idx
  on public.verification_requests (status, created_at desc);
create index if not exists verification_subject_idx
  on public.verification_requests (subject_type, subject_id);

create or replace function public.protect_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if tg_table_name = 'profiles' then
      new.is_verified := old.is_verified;
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;
    elsif tg_table_name = 'channels' then
      new.is_verified := old.is_verified;
      new.verified_at := old.verified_at;
      new.verified_by := old.verified_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verification on public.profiles;
create trigger profiles_protect_verification
  before update on public.profiles
  for each row execute function public.protect_verification_fields();

drop trigger if exists channels_protect_verification on public.channels;
create trigger channels_protect_verification
  before update on public.channels
  for each row execute function public.protect_verification_fields();

create or replace function public.set_verification(
  subject_type text,
  subject_id uuid,
  verified boolean,
  reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_permission('users.suspend') and not public.is_admin() then
    raise exception 'not authorized';
  end if;
  if subject_type not in ('user','channel') then
    raise exception 'invalid subject type';
  end if;

  if subject_type = 'user' then
    update profiles
       set is_verified = verified,
           verified_at = case when verified then now() else null end,
           verified_by = case when verified then auth.uid() else null end
     where id = subject_id;
  else
    update channels
       set is_verified = verified,
           verified_at = case when verified then now() else null end,
           verified_by = case when verified then auth.uid() else null end
     where id = subject_id;
  end if;

  if not found then raise exception 'subject not found'; end if;

  update verification_requests
     set status = case when verified then 'approved' else 'rejected' end,
         reviewer_id = auth.uid(),
         review_note = reason,
         reviewed_at = now()
   where subject_type = set_verification.subject_type
     and subject_id = set_verification.subject_id
     and status = 'pending';

  insert into admin_audit_logs
    (admin_id, action, target_type, target_id, reason, metadata)
  values
    (auth.uid(), 'verification.set', subject_type, subject_id::text, reason,
     jsonb_build_object('verified', verified));

  return true;
end;
$$;
grant execute on function public.set_verification(text, uuid, boolean, text)
  to authenticated;

alter table public.verification_requests enable row level security;

drop policy if exists verification_requests_read on public.verification_requests;
create policy verification_requests_read on public.verification_requests
  for select to authenticated
  using (requester_id = auth.uid() or public.has_admin_permission('reports.read') or public.is_admin());

drop policy if exists verification_requests_insert on public.verification_requests;
create policy verification_requests_insert on public.verification_requests
  for insert to authenticated
  with check (requester_id = auth.uid());

drop policy if exists verification_requests_admin on public.verification_requests;
create policy verification_requests_admin on public.verification_requests
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
