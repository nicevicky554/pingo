/**
 * The single privileged Supabase client for PINGO server routes.
 *
 * - Uses SUPABASE_URL + SUPABASE_SECRET_KEY (service_role) and never forwards
 *   the caller's Authorization header into this client.
 * - Sessions are never persisted or refreshed here.
 * - Authentication is always verified separately with `admin.auth.getUser()`;
 *   callers must then check membership/ownership/role before privileged work.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ServerSupabase = {
  admin: SupabaseClient;
  url: string;
  secret: string;
};

export function pickEnv(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value && value.trim().length > 0));
}

export function serverSupabase(): ServerSupabase | null {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = pickEnv(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!url || !secret) return null;
  return {
    url,
    secret,
    admin: createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}
