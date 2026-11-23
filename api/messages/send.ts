/**
 * POST /api/messages/send
 *
 * Verified server fallback for inserts rejected by browser RLS. The secret-key
 * client is used only after the caller's access token, conversation membership
 * and channel posting permission are checked independently.
 */

import { createClient } from "@supabase/supabase-js";
import { rateLimit } from "../_lib/rate-limit";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS = new Set(["text", "image", "video", "file", "voice"]);
const MAX_BODY = 20_000;

function pick(...values: Array<string | undefined>) {
  return values.find((value) => value && value.length > 0);
}

export default async function handler(req: NodeRequest, res: NodeResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const secretKey = pick(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!supabaseUrl || !secretKey) {
    res.status(500).json({ error: "Server Supabase credentials are missing." });
    return;
  }

  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Sign in before sending messages." });
    return;
  }

  const raw = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as
    | Record<string, unknown>
    | undefined;
  const conversationId = String(raw?.conversation_id ?? "");
  const body = String(raw?.body ?? "").slice(0, MAX_BODY);
  const kind = String(raw?.kind ?? "text");
  const attachmentPath = raw?.attachment_path ? String(raw.attachment_path) : null;
  const attachmentName = raw?.attachment_name ? String(raw.attachment_name) : null;
  const attachmentSize = raw?.attachment_size != null ? Number(raw.attachment_size) : null;
  const attachmentMime = raw?.attachment_mime ? String(raw.attachment_mime) : null;
  const durationSeconds = raw?.duration_seconds != null ? Number(raw.duration_seconds) : null;
  const replyToId = raw?.reply_to_id ? String(raw.reply_to_id) : null;
  const expiresAt = raw?.expires_at ? String(raw.expires_at) : null;
  const viewOnce = raw?.view_once === true;
  const waveform = Array.isArray(raw?.waveform)
    ? (raw.waveform as unknown[]).map(Number).filter(Number.isFinite).slice(0, 120)
    : null;

  if (!UUID.test(conversationId) || !KINDS.has(kind)) {
    res.status(400).json({ error: "Invalid message payload." });
    return;
  }
  if (!body.trim() && !attachmentPath) {
    res.status(400).json({ error: "A message needs text or an attachment." });
    return;
  }
  if (attachmentPath && !attachmentPath.startsWith(`${conversationId}/`)) {
    res.status(400).json({ error: "Attachment does not belong to this conversation." });
    return;
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Your session is no longer valid." });
    return;
  }
  const userId = userData.user.id;

  const limit = await rateLimit(`pingo:send:${userId}`, 60, 60);
  if (!limit.allowed) {
    res.status(429).json({ error: "Slow down. Too many messages." });
    return;
  }

  const [{ data: membership }, { data: conversation }] = await Promise.all([
    admin
      .from("conversation_members")
      .select("user_id,role")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("conversations")
      .select("id,type,announce_only")
      .eq("id", conversationId)
      .maybeSingle(),
  ]);
  if (!membership || !conversation) {
    res.status(403).json({ error: "You are not a member of this conversation." });
    return;
  }
  if (
    conversation.announce_only &&
    membership.role !== "owner" &&
    membership.role !== "admin"
  ) {
    res.status(403).json({ error: "Only admins can post in this conversation." });
    return;
  }

  // Mirror the direct-message block rule enforced by the RLS insert policy.
  if (conversation.type === "direct") {
    const { data: others } = await admin
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .neq("user_id", userId);
    const otherIds = (others ?? []).map((row) => row.user_id);
    if (otherIds.length > 0) {
      const { data: blocks } = await admin
        .from("blocks")
        .select("blocker_id,blocked_id")
        .or(
          `and(blocker_id.eq.${userId},blocked_id.in.(${otherIds.join(",")})),and(blocker_id.in.(${otherIds.join(",")}),blocked_id.eq.${userId})`,
        );
      if (blocks && blocks.length > 0) {
        res.status(403).json({ error: "This conversation is blocked." });
        return;
      }
    }
  }

  if (replyToId) {
    const { data: reply } = await admin
      .from("messages")
      .select("id")
      .eq("id", replyToId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (!reply) {
      res.status(400).json({ error: "The replied-to message is unavailable." });
      return;
    }
  }

  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: userId,
    body,
    kind,
    attachment_path: attachmentPath,
    attachment_name: attachmentName,
    attachment_size: attachmentSize,
    attachment_mime: attachmentMime,
    duration_seconds: durationSeconds,
    reply_to_id: replyToId,
    expires_at: expiresAt,
    view_once: viewOnce,
  };
  if (waveform && waveform.length > 0) payload.waveform = waveform;

  const { data, error } = await admin
    .from("messages")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    res.status(500).json({ error: error.message, code: error.code });
    return;
  }
  res.status(200).json({ message: data });
}
