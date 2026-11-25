/**
 * POST /api/auth/register
 *
 * No-SMS registration. This route is only accepted while an administrator has
 * selected "No SMS OTP Required"; in OTP mode it refuses and the client must
 * use the verified WhatsApp/SMS flow instead.
 *
 * The account is a real Supabase Auth user with a stable UUID. The phone number
 * is linked to that UUID; the user's PIN/password is stored only as a Supabase
 * Auth credential hash. Nothing is kept in local storage and no universal code
 * exists.
 */

import { createClient } from "@supabase/supabase-js";
import {
  credentialError,
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
  if (!phone) {
    res.status(400).json({ error: "Enter a valid phone number with its country code." });
    return;
  }
  if (!credential) {
    res.status(400).json({ error: credentialError() });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = rawIp?.split(",")[0]?.trim() || "unknown";
  const limit = await rateLimit(`pingo:register:${ip}`, 10, 600);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
    return;
  }

  const server = serverSupabase();
  if (!server) {
    res.status(503).json({
      error: "Registration is not configured on the server.",
      code: "server_not_configured",
    });
    return;
  }
  const { admin, url } = server;

  const mode = await getPhoneVerificationMode(admin);
  if (mode !== "none") {
    res.status(409).json({
      error:
        "Phone verification is required. Register with the verification code instead.",
      code: "otp_required",
    });
    return;
  }

  const anonKey = pickEnv(
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
  );

  try {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existingProfile) {
      res.status(409).json({
        error: "This number is already registered. Sign in instead.",
        code: "phone_taken",
      });
      return;
    }

    const email = phoneCredentialEmail(phone);
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: credential,
      user_metadata: { phone, registration: "no_otp" },
    });

    if (createError || !created.user) {
      const taken = /already|exists|duplicate/i.test(createError?.message ?? "");
      res.status(taken ? 409 : 500).json({
        error: taken
          ? "This number is already registered. Sign in instead."
          : "The account could not be created. Try again.",
        code: taken ? "phone_taken" : "create_failed",
      });
      if (!taken) {
        console.error("[PINGO] no-OTP registration failed", createError?.code);
      }
      return;
    }

    // The auth trigger normally creates these rows; upsert makes the link
    // deterministic even on projects where the trigger predates this feature.
    await admin.from("profiles").upsert(
      {
        id: created.user.id,
        phone,
        display_name:
          typeof body.display_name === "string"
            ? body.display_name.trim().slice(0, 60)
            : "",
      },
      { onConflict: "id" },
    );
    await admin
      .from("user_settings")
      .upsert({ user_id: created.user.id }, { onConflict: "user_id" });

    await admin.from("phone_access_events").insert({
      phone,
      user_id: created.user.id,
      event: "register",
      ip,
    });

    if (anonKey) {
      const authClient = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: signedIn, error: signInError } =
        await authClient.auth.signInWithPassword({ email, password: credential });
      if (!signInError && signedIn.session) {
        res.status(201).json({
          ok: true,
          user_id: created.user.id,
          session: {
            access_token: signedIn.session.access_token,
            refresh_token: signedIn.session.refresh_token,
          },
        });
        return;
      }
    }

    // Fallback if the publishable key is unavailable: the browser exchanges a
    // single-use magic-link token hash for the same user's session.
    const { data: link } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (!tokenHash) {
      res.status(500).json({
        error:
          "Your account was created, but the session could not be started. Sign in with your PIN.",
        code: "account_created",
      });
      return;
    }
    res.status(201).json({
      ok: true,
      user_id: created.user.id,
      token_hash: tokenHash,
    });
  } catch (error) {
    console.error(
      "[PINGO] registration error",
      error instanceof Error ? error.message : error,
    );
    res.status(500).json({ error: "The account could not be created. Try again." });
  }
}
