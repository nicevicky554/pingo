/**
 * POST /api/messages/view-once
 *
 * Consumes a view-once attachment: verifies the caller, records the view,
 * removes the Storage object and clears the message's attachment reference so
 * it cannot be fetched again from chat history.
 */
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
    res.status(500).json({ error: "Server Supabase credentials are missing." });
    return;
  }

  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(/^Bearer\s+/i, "");
  if (!token) {
    res.status(401).json({ error: "Sign in before opening media." });
    return;
  }

  const raw = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) as
    | Record<string, unknown>
    | undefined;
  const messageId = String(raw?.message_id ?? "");
  if (!UUID.test(messageId)) {
    res.status(400).json({ error: "Invalid message." });
    return;
  }

  const admin = server.admin;
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Your session is no longer valid." });
    return;
  }
  const viewerId = userData.user.id;

  const { data: message } = await admin
    .from("messages")
    .select("id,conversation_id,sender_id,attachment_path,view_once,kind")
    .eq("id", messageId)
    .maybeSingle();
  if (!message || !message.view_once) {
    res.status(404).json({ error: "View-once media was not found." });
    return;
  }
  if (message.sender_id === viewerId) {
    res.status(400).json({ error: "You cannot consume your own view-once media." });
    return;
  }

  const { data: membership } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", message.conversation_id)
    .eq("user_id", viewerId)
    .maybeSingle();
  if (!membership) {
    res.status(403).json({ error: "You are not a member of this conversation." });
    return;
  }

  const path = message.attachment_path as string | null;
  if (!path) {
    res.status(200).json({ ok: true, alreadyViewed: true });
    return;
  }

  await admin
    .from("message_views")
    .upsert(
      { message_id: messageId, viewer_id: viewerId },
      { onConflict: "message_id,viewer_id", ignoreDuplicates: true },
    );

  const { error: removeError } = await admin.storage.from("media").remove([path]);
  if (removeError) {
    res.status(500).json({ error: "The media could not be removed after viewing." });
    return;
  }

  const { error: updateError } = await admin
    .from("messages")
    .update({
      attachment_path: null,
      attachment_name: null,
      attachment_size: null,
      attachment_mime: null,
    })
    .eq("id", messageId);
  if (updateError) {
    res.status(500).json({ error: "The message could not be marked as viewed." });
    return;
  }

  res.status(200).json({ ok: true });
}
