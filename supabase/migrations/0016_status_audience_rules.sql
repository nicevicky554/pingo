-- PINGO — correct status audience evaluation.
--
-- The original can_view_status() fell through to the contacts rule for every
-- value other than everyone/nobody/contacts, which meant "Only share with"
-- still exposed a status to all contacts. Each mode is now explicit.

create or replace function public.can_view_status(
  owner uuid,
  viewer uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.visibility;
begin
  if owner = viewer then return true; end if;
  if viewer is null or public.is_blocked(owner, viewer) then return false; end if;

  select status_visibility into v from public.user_settings where user_id = owner;
  if v is null then return false; end if;

  if v = 'everyone' then return true; end if;
  if v = 'nobody' then return false; end if;
  if v = 'contacts' then return public.is_contact(owner, viewer); end if;

  if v = 'only' then
    return exists (
      select 1 from public.status_audience a
      where a.user_id = owner
        and a.viewer_id = viewer
        and a.rule = 'only'
    );
  end if;

  -- contacts_except
  return public.is_contact(owner, viewer)
    and not exists (
      select 1 from public.status_audience a
      where a.user_id = owner
        and a.viewer_id = viewer
        and a.rule = 'except'
    );
end;
$$;

-- Media access follows the owning status row: a signed URL cannot be minted
-- for a status that has expired or that the viewer may no longer see.
drop policy if exists status_media_read on storage.objects;
create policy status_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'status-media'
    and exists (
      select 1
      from public.status_updates s
      where s.media_path = name
        and s.expires_at > now()
        and public.can_view_status(s.user_id, auth.uid())
    )
  );

