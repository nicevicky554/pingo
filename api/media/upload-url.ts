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
import { rateLimit } from "../_lib/rate-limit";
import {
  authenticate,
  getMembership,
  readJson,
  UUID,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/supabase-admin";

const MAX_BYTES = 25 * 1024 * 1024;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const auth = await authenticate(req, res, {
    signInMessage: "Sign in before uploading media.",
  });
  if (!auth) return;
  const { admin, user } = auth;

  const body = readJson(req) as {
    conversationId?: string;
    name?: string;
    size?: number;
    type?: string;
  };
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

  const membership = await getMembership(admin, conversationId, user.id);
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this conversation." });
    return;
  }

  const limit = await rateLimit(
    `pingo:upload:${user.id}`,
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
