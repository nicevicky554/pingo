-- PINGO — WhatsApp phone sign-in codes
--
-- Codes are generated and verified by the Vercel API (never by the browser).
-- Only an HMAC digest of the six-digit code is stored, together with an expiry
-- and an attempt counter. The table is server-only: RLS is enabled and no
-- policy grants access to `anon` or `authenticated`, so even a valid user JWT
-- cannot read or write it. The secret-key server client bypasses RLS.

create table if not exists public.phone_otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  code_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 20),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_otp_codes_phone_idx
  on public.phone_otp_codes (phone, created_at desc);

alter table public.phone_otp_codes enable row level security;

revoke all on public.phone_otp_codes from anon, authenticated;
grant all on public.phone_otp_codes to service_role;

-- Expired and consumed codes are useless; keep the table small.
create or replace function public.prune_phone_otp_codes()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.phone_otp_codes
  where created_at < now() - interval '1 day'
     or consumed_at is not null;
$$;

revoke all on function public.prune_phone_otp_codes() from public, anon, authenticated;
grant execute on function public.prune_phone_otp_codes() to service_role;
