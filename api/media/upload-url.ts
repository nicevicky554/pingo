/**
 * POST /api/media/upload-url
 *
 * Server-only endpoint. Verifies the caller's Supabase access token, checks
 * conversation membership with the secret-key client, then returns a signed
 * upload token for the private `media` bucket.
 *
 * The secret key never reaches the browser. The upload itself goes directly to
 * Supabase Storage with the short-lived signed token.
 */

import { randomUUID } from "node:crypto";
import { rateLimit } from "../_lib/rate-limit.js";
import { serverSupabase } from "../_lib/supabase.js";

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

const MAX_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: NodeRequest, res: NodeResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const server = serverSupabase();
  if (!server) {
    res.status(500).json({
      error:
        "Server Supabase credentials are not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).",
    });
    return;
  }

  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) {
    res.status(401).json({ error: "Sign in before uploading media." });
    return;
  }

  const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as
    | { conversationId?: string; name?: string; size?: number; type?: string }
    | undefined;
  const conversationId = body?.conversationId ?? "";
  const name = (body?.name ?? "attachment").slice(0, 120);
  const size = Number(body?.size ?? 0);

  if (!UUID.test(conversationId)) {
    res.status(400).json({ error: "Invalid conversation." });
    return;
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
    res.status(400).json({ error: "Attachment must be between 1 byte and 25 MB." });
    return;
  }

  // Shared privileged client: no persisted session and no forwarded user
  // Authorization header. The user is verified separately below.
  const admin = server.admin;

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Your session is no longer valid." });
    return;
  }

  const { data: membership, error: memberError } = await admin
    .from("conversation_members")
    .select("user_id,role")
    .eq("conversation_id", conversationId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (memberError) {
    res.status(500).json({ error: "Membership could not be verified." });
    return;
  }
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this conversation." });
    return;
  }

  const limit = await rateLimit(
    `pingo:upload:${userData.user.id}`,
    30,
    60,
  );
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many uploads. Wait a moment and retry." });
    return;
  }

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${conversationId}/${randomUUID()}-${safeName}`;
  const { data: signed, error: signError } = await admin.storage
    .from("media")
    .createSignedUploadUrl(path);

  if (signError || !signed?.token) {
    res.status(500).json({ error: signError?.message ?? "Upload URL could not be created." });
    return;
  }

  res.status(200).json({ path, token: signed.token });
}
