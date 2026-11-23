-- PINGO — platform branding
-- Readable by everyone (signed-in and signed-out), writable only through an
-- administrator-checked security-definer function.

create or replace function public.get_public_branding()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from platform_settings where key = 'branding'),
    '{}'::jsonb
  );
$$;

grant execute on function public.get_public_branding() to anon, authenticated;

create or replace function public.set_platform_branding(
  next_branding jsonb,
  reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  cleaned := jsonb_strip_nulls(coalesce(next_branding, '{}'::jsonb));

  insert into platform_settings (key, value, updated_at)
  values ('branding', cleaned, now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();

  insert into admin_audit_logs (admin_id, action, target_type, target_id, reason, metadata)
  values (
    auth.uid(), 'platform.branding', 'platform', 'branding',
    coalesce(reason, 'Published branding assets'), cleaned
  );

  return cleaned;
end;
$$;

grant execute on function public.set_platform_branding(jsonb, text) to authenticated;
