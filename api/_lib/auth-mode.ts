/**
 * Server-side phone registration mode.
 *
 * The browser may read the mode for presentation, but the registration and
 * sign-in routes independently enforce it here. The value lives in
 * `platform_settings` and is changed only through an audited database function.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PhoneVerificationMode = "otp" | "none";

export async function getPhoneVerificationMode(
  admin: SupabaseClient,
): Promise<PhoneVerificationMode> {
  const { data, error } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", "auth.phone_verification")
    .maybeSingle();

  // A missing setting (migration not applied) must fail closed: keep OTP.
  if (error || !data) return "otp";
  const value = (data as { value?: { mode?: string } | null }).value;
  return value?.mode === "none" ? "none" : "otp";
}

/** Deterministic, non-deliverable email used only to hold a Supabase session. */
export function phoneCredentialEmail(phone: string) {
  return `p${phone.replace(/\D/g, "")}@phone.pingo.app`;
}

const PIN = /^\d{6,12}$/;
const PASSPHRASE = /^.{8,72}$/;

/** Accept a six-digit PIN or an 8–72 character passphrase, nothing weaker. */
export function normalizeCredential(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (PIN.test(value) || PASSPHRASE.test(value)) return value;
  return null;
}

export function credentialError() {
  return "Choose a 6–12 digit PIN, or a password of at least 8 characters.";
}
