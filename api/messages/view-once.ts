/**
 * POST /api/messages/view-once
 *
 * Consumes a view-once attachment: verifies the caller, records the view,
 * removes the Storage object and clears the message's attachment reference so
 * it cannot be fetched again from chat history.
 */
import {
  authenticate,
  getMembership,
  readJson,
  UUID,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/supabase-admin";

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const auth = await authenticate(req, res, {
    signInMessage: "Sign in before opening media.",
  });
  if (!auth) return;
  const { admin, user } = auth;
  const viewerId = user.id;

  const raw = readJson(req);
  const messageId = String(raw?.message_id ?? "");
  if (!UUID.test(messageId)) {
    res.status(400).json({ error: "Invalid message." });
    return;
  }

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

  const membership = await getMembership(admin, message.conversation_id, viewerId);
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
