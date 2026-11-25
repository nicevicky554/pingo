/**
 * POST /api/auth/login
 *
 * Credential sign-in for no-OTP deployments. The server resolves the phone to
 * its existing Supabase Auth user, verifies the PIN/password with Supabase
 * Auth, and returns that user's session. A random six-digit code cannot grant
 * access to somebody else's account: only the stored credential hash matches.
 */

import { createClient } from "@supabase/supabase-js";
import {
  getPhoneVerificationMode,
  normalizeCredential,
  phoneCredentialEmail,
} from "../_lib/auth-mode";
import { normalizePhone, readJsonBody } from "../_lib/otp";
import { rateLimit } from "../_lib/rate-limit";
import { pickEnv, serverSupabase } from "../_lib/supabase";

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
  const credential = normalizeCredential(body.credential);
  if (!phone || !credential) {
    res.status(400).json({ error: "Enter your phone number and PIN or password." });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = rawIp?.split(",")[0]?.trim() || "unknown";
  const byPhone = await rateLimit(`pingo:login:phone:${phone}`, 8, 600);
  const byIp = await rateLimit(`pingo:login:ip:${ip}`, 20, 600);
  if (!byPhone.allowed || !byIp.allowed) {
    res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
    return;
  }

  const server = serverSupabase();
  const anonKey = pickEnv(
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  );
  if (!server || !anonKey) {
    res.status(503).json({
      error: "Sign-in is not configured on the server.",
      code: "server_not_configured",
    });
    return;
  }
  const { admin, url } = server;

  const mode = await getPhoneVerificationMode(admin);
  if (mode !== "none") {
    res.status(409).json({
      error: "Use the verification code to sign in on this deployment.",
      code: "otp_required",
    });
    return;
  }

  const genericError = "The phone number or PIN is incorrect.";

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("id,status,suspended_reason,phone")
      .eq("phone", phone)
      .maybeSingle();

    if (!profile) {
      await admin.from("phone_access_events").insert({
        phone,
        event: "login_failed",
        ip,
      });
      res.status(401).json({ error: genericError });
      return;
    }
    if (profile.status && profile.status !== "active") {
      res.status(403).json({
        error:
          profile.suspended_reason?.trim() ||
          "This account is suspended. Contact PINGO support.",
        code: "account_suspended",
      });
      return;
    }

    const { data: userData } = await admin.auth.admin.getUserById(profile.id);
    const email = userData.user?.email ?? phoneCredentialEmail(phone);

    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedIn, error: signInError } =
      await authClient.auth.signInWithPassword({ email, password: credential });

    if (signInError || !signedIn.session) {
      await admin.from("phone_access_events").insert({
        phone,
        user_id: profile.id,
        event: "login_failed",
        ip,
      });
      res.status(401).json({ error: genericError });
      return;
    }

    await admin.from("phone_access_events").insert({
      phone,
      user_id: profile.id,
      event: "login",
      ip,
    });

    res.status(200).json({
      ok: true,
      user_id: profile.id,
      session: {
        access_token: signedIn.session.access_token,
        refresh_token: signedIn.session.refresh_token,
      },
    });
  } catch (error) {
    console.error(
      "[PINGO] login error",
      error instanceof Error ? error.message : error,
    );
    res.status(500).json({ error: "Sign-in failed. Try again." });
  }
}
