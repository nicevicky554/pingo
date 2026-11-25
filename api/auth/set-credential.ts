/**
 * POST /api/auth/set-credential
 *
 * Lets an already signed-in account establish a PIN/password. This is how an
 * account created through phone verification can later sign in on a deployment
 * where SMS verification is turned off — without any universal code and without
 * storing the credential outside Supabase Auth.
 */

import {
  credentialError,
  normalizeCredential,
} from "../_lib/auth-mode";
import { readJsonBody } from "../_lib/otp";
import { rateLimit } from "../_lib/rate-limit";
import { serverSupabase } from "../_lib/supabase";

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

  const header = req.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  const token = raw?.startsWith("Bearer ") ? raw.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Sign in again before changing your PIN." });
    return;
  }

  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = rawIp?.split(",")[0]?.trim() || "unknown";
  const limit = await rateLimit(`pingo:set-pin:${ip}`, 10, 600);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many attempts. Wait a few minutes." });
    return;
  }

  const server = serverSupabase();
  if (!server) {
    res.status(503).json({ error: "Server credentials are not configured." });
    return;
  }

  const body = readJsonBody(req.body);
  const credential = normalizeCredential(body.credential);
  if (!credential) {
    res.status(400).json({ error: credentialError() });
    return;
  }

  const { data: userData, error: userError } = await server.admin.auth.getUser(
    token,
  );
  if (userError || !userData.user) {
    res.status(401).json({ error: "Your session expired. Sign in again." });
    return;
  }

  const { error } = await server.admin.auth.admin.updateUserById(
    userData.user.id,
    { password: credential },
  );
  if (error) {
    console.error("[PINGO] set credential failed", error.code);
    res.status(500).json({
      error:
        "The PIN could not be saved. If the account uses an external provider, contact support.",
    });
    return;
  }

  await server.admin.from("security_events").insert({
    user_id: userData.user.id,
    event: "auth.set_credential",
    ip,
    metadata: { via: "settings" },
  });

  res.status(200).json({ ok: true });
}
