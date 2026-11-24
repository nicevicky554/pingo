import {
  authenticate,
  getMembership,
  readJson,
  UUID,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/supabase-admin";

const OUTCOMES = new Set(["ended", "missed", "declined", "failed"]);

/**
 * Records the call summary line in the chat. Runs on the trusted service so
 * announce-only groups and RLS on messages never block the call log, but only
 * the verified initiator of that call, who is a member of the conversation,
 * may write it.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  const ctx = await authenticate(req, res);
  if (!ctx) return;
  const { admin, user } = ctx;
  const body = readJson(req);
  const callId = typeof body.callId === "string" ? body.callId : "";
  const outcome = typeof body.outcome === "string" ? body.outcome : "";
  const durationRaw = Number(body.duration);
  const duration = Number.isFinite(durationRaw) ? Math.max(0, Math.min(86400, Math.floor(durationRaw))) : 0;

  if (!UUID.test(callId) || !OUTCOMES.has(outcome)) {
    res.status(400).json({ error: "Invalid call log request." });
    return;
  }

  const { data: call } = await admin
    .from("calls")
    .select("id,initiator_id,conversation_id,kind")
    .eq("id", callId)
    .maybeSingle();
  const record = call as
    | { id: string; initiator_id: string; conversation_id: string | null; kind: string | null }
    | null;
  if (!record || record.initiator_id !== user.id || !record.conversation_id) {
    res.status(403).json({ error: "You cannot log this call." });
    return;
  }
  if (!(await getMembership(admin, record.conversation_id, user.id))) {
    res.status(403).json({ error: "You are not a member of this chat." });
    return;
  }

  const label = record.kind === "video" ? "video call" : "voice call";
  const text =
    outcome === "missed"
      ? `missed a ${label}`
      : outcome === "declined"
        ? `declined a ${label}`
        : outcome === "failed"
          ? `${label} failed`
          : `started a ${label}${duration ? ` (${Math.floor(duration / 60)}m ${duration % 60}s)` : ""}`;

  const { error } = await admin.from("messages").insert({
    conversation_id: record.conversation_id,
    sender_id: user.id,
    kind: "system",
    body: text,
  });
  if (error) {
    res.status(500).json({ error: "Could not record the call.", code: error.code });
    return;
  }
  res.status(200).json({ ok: true });
}
