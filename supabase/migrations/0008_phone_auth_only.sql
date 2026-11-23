-- PINGO — phone OTP only
-- Removes the legacy in-app auth-mode switch. Supabase Phone Auth is the only
-- sign-in path; testers use Supabase dashboard test phone numbers, which still
-- create real auth.users rows.

update public.platform_settings
set value = '{"mode":"live"}'::jsonb, updated_at = now()
where key = 'auth.otp_mode';

drop function if exists public.get_auth_mode();
drop function if exists public.set_auth_mode(text, text);

-- Anonymous sign-in must also be disabled in the Supabase dashboard:
-- Authentication → Providers → Anonymous sign-ins = OFF.
-- PINGO no longer calls supabase.auth.signInAnonymously().
