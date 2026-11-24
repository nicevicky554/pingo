/**
 * POST /api/auth/verify-otp
 *
 * Verifies a PINGO WhatsApp code, then returns a single-use Supabase token hash
 * that the browser exchanges for a real session. Returning accounts resolve to
 * their existing auth.users row, so they continue straight into the app.
 */

import { rateLimit } from "../_lib/rate-limit";
import {
  MAX_OTP_ATTEMPTS,
  clientIp,
  createSessionToken,
  ensureAuthUser,
  hashCode,
  normalizeCode,
  normalizePhone,
  readJsonBody,
  sameHash,
  serverSupabase,
} from "../_lib/otp";

type NodeRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type NodeResponse = {
  status: (code: number) => NodeResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

export default async function handler(req: NodeRequest, res: NodeResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = readJsonBody(req.body);
  const phone = normalizePhone(body.phone);
  const code = normalizeCode(body.code);
  if (!phone || !code) {
    res.status(400).json({ error: "Enter the six-digit code from WhatsApp." });
    return;
  }

  const ip = clientIp(req.headers);
  const limit = await rateLimit(`pingo:otp:verify:${phone}:${ip}`, 10, 600);
  if (!limit.allowed) {
    res.status(429).json({
      error: "Too many attempts. Wait a few minutes before trying again.",
    });
    return;
  }

  const server = serverSupabase();
  if (!server) {
    res.status(503).json({
      error:
        "Phone sign-in is not configured on the server (SUPABASE_URL / SUPABASE_SECRET_KEY).",
      code: "server_not_configured",
    });
    return;
  }
  const { admin } = server;

  const { data: record, error: lookupError } = await admin
    .from("phone_otp_codes")
    .select("id,code_hash,attempts,expires_at,consumed_at")
    .eq("phone", phone)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    if (lookupError.code === "42P01") {
      res.status(503).json({
        error:
          "Phone sign-in is not ready. Apply Supabase migration 0014_whatsapp_otp.sql.",
        code: "migration_missing",
      });
      return;
    }
    res.status(500).json({ error: "Could not check the code. Try again." });
    return;
  }

  if (!record) {
    res.status(400).json({
      error: "That code is no longer valid. Request a new one.",
    });
    return;
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await admin.from("phone_otp_codes").delete().eq("id", record.id);
    res.status(400).json({
      error: "That code has expired. Request a new one.",
    });
    return;
  }
  if (Number(record.attempts) >= MAX_OTP_ATTEMPTS) {
    await admin.from("phone_otp_codes").delete().eq("id", record.id);
    res.status(429).json({
      error: "Too many incorrect attempts. Request a new code.",
    });
    return;
  }

  if (!sameHash(String(record.code_hash), hashCode(phone, code))) {
    await admin
      .from("phone_otp_codes")
      .update({ attempts: Number(record.attempts) + 1 })
      .eq("id", record.id);
    res.status(400).json({ error: "That code did not match. Try again." });
    return;
  }

  // Single use: consume before issuing a session.
  const { error: consumeError } = await admin
    .from("phone_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", record.id)
    .is("consumed_at", null);
  if (consumeError) {
    res.status(500).json({ error: "Could not complete sign-in. Try again." });
    return;
  }

  try {
    const { user, email } = await ensureAuthUser(admin, phone);

    // Keep the verified number mirrored on the profile for account recovery.
    const { data: profile } = await admin
      .from("profiles")
      .select("id,phone,username,status,suspended_reason")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      await admin
        .from("profiles")
        .insert({ id: user.id, display_name: "", phone })
        .select("id")
        .maybeSingle();
      await admin
        .from("user_settings")
        .insert({ user_id: user.id })
        .select("user_id")
        .maybeSingle();
    } else if (profile.phone !== phone) {
      await admin.from("profiles").update({ phone }).eq("id", user.id);
    }

    if (profile?.status && profile.status !== "active") {
      res.status(403).json({
        error:
          profile.suspended_reason?.trim() ||
          "This account is suspended. Contact PINGO support.",
        code: "account_suspended",
      });
      return;
    }

    const tokenHash = await createSessionToken(admin, email);

    // Any other outstanding codes for this number are now useless.
    await admin
      .from("phone_otp_codes")
      .delete()
      .eq("phone", phone)
      .is("consumed_at", null);

    res.status(200).json({
      ok: true,
      token_hash: tokenHash,
      phone,
      // Used only to order the client redirect; the app still enforces setup.
      has_profile: Boolean(profile?.username),
    });
  } catch (error) {
    console.error(
      "[PINGO] OTP session exchange failed",
      error instanceof Error ? error.message : error,
    );
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Could not complete sign-in. Try again.",
    });
  }
}
