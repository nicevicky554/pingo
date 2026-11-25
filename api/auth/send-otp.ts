/**
 * POST /api/auth/send-otp
 *
 * Sends a six-digit PINGO sign-in code through Twilio's WhatsApp channel.
 * The code itself never leaves the server: only an HMAC digest is stored.
 */

import { getPhoneVerificationMode } from "../_lib/auth-mode.js";
import { rateLimit } from "../_lib/rate-limit.js";
import {
  OTP_TTL_SECONDS,
  clientIp,
  hashCode,
  newCode,
  normalizePhone,
  readJsonBody,
  sendWhatsAppCode,
  serverSupabase,
} from "../_lib/otp.js";

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
  if (!phone) {
    res.status(400).json({
      error: "Enter a valid phone number including the country code.",
    });
    return;
  }

  const ip = clientIp(req.headers);
  const [byPhone, byIp] = await Promise.all([
    rateLimit(`pingo:otp:phone:${phone}`, 5, 600),
    rateLimit(`pingo:otp:ip:${ip}`, 15, 600),
  ]);
  if (!byPhone.allowed || !byIp.allowed) {
    res.status(429).json({
      error: "Too many codes requested. Wait a few minutes and try again.",
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
  const recovery = body.recovery === true;

  // The administrator-selected mode is enforced here, not only in the UI. In
  // no-OTP mode a code is still allowed as an explicit recovery path for an
  // account that already exists; it can never create a new account.
  if ((await getPhoneVerificationMode(admin)) === "none") {
    if (!recovery) {
      res.status(409).json({
        error:
          "SMS verification is turned off on this deployment. Sign in with your phone number and PIN.",
        code: "otp_disabled",
      });
      return;
    }
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (!existing) {
      res.status(404).json({
        error:
          "No PINGO account uses this number. Create an account with a PIN first.",
        code: "account_not_found",
      });
      return;
    }
  }

  const code = newCode();

  // PostgreSQL-backed throttle: works even when Upstash is not configured, so
  // repeated requests cannot turn into unlimited paid WhatsApp messages.
  const { count } = await admin
    .from("phone_otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", new Date(Date.now() - 600_000).toISOString());
  if ((count ?? 0) >= 5) {
    res.status(429).json({
      error: "Too many codes requested. Wait ten minutes and try again.",
    });
    return;
  }

  // Invalidate older outstanding codes for this number before issuing a new one.
  await admin
    .from("phone_otp_codes")
    .delete()
    .eq("phone", phone)
    .is("consumed_at", null);

  const { error: insertError } = await admin.from("phone_otp_codes").insert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
  });
  if (insertError) {
    if (insertError.code === "42P01") {
      res.status(503).json({
        error:
          "Phone sign-in is not ready. Apply Supabase migration 0014_whatsapp_otp.sql.",
        code: "migration_missing",
      });
      return;
    }
    console.error("[PINGO] OTP insert failed", insertError.code);
    res.status(500).json({ error: "Could not start sign-in. Try again." });
    return;
  }

  const delivery = await sendWhatsAppCode(phone, code);
  if (!delivery.ok) {
    await admin
      .from("phone_otp_codes")
      .delete()
      .eq("phone", phone)
      .is("consumed_at", null);
    // Configuration hints are safe to show; provider errors are logged in full
    // server-side and reduced to a code so account details never leak.
    const safeError =
      delivery.code === "not_configured" || !delivery.code
        ? delivery.error
        : `WhatsApp could not deliver the code (Twilio ${delivery.code}). Check the WhatsApp sender configuration.`;
    res.status(delivery.code === "not_configured" ? 503 : 502).json({
      error: safeError,
      code: delivery.code ?? "delivery_failed",
    });
    return;
  }

  // Best-effort housekeeping; never blocks sign-in.
  void admin
    .from("phone_otp_codes")
    .delete()
    .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

  res.status(200).json({
    ok: true,
    channel: "whatsapp",
    expiresIn: OTP_TTL_SECONDS,
  });
}
