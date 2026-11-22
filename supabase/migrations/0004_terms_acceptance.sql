-- PINGO — agreement acceptance
alter table public.profiles
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Policy version the account holder actively accepted during profile setup.';
