/**
 * POST /api/push/deliver
 *
 * Target of a Supabase Database Webhook on INSERT into public.notifications.
 * Authenticated with the shared PUSH_WEBHOOK_SECRET (header
 * `x-pingo-webhook-secret`), never with a user token. Sends a Web Push to every
 * stored subscription of the notified user and removes expired ones.
 */
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import {
  getAdminClient,
  jsonHeaders,
  readJson,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/supabase-admin";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  jsonHeaders(res);
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.PUSH_WEBHOOK_SECRET?.trim();
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY)?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@pingo.app";
  const admin = getAdminClient();
  if (!secret || !publicKey || !privateKey || !admin) {
    res.status(503).json({ error: "Push delivery is not configured." });
    return;
  }

  const provided = req.headers["x-pingo-webhook-secret"];
  const value = Array.isArray(provided) ? provided[0] : provided;
  if (!value || !safeEqual(value, secret)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = readJson(req);
  const record = payload.record as
    | { user_id?: string; kind?: string; title?: string; body?: string | null; data?: Record<string, unknown> }
    | undefined;
  if (payload.type !== "INSERT" || !record?.user_id || !record.title) {
    res.status(200).json({ ok: true, skipped: true });
    return;
  }

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("id,token")
    .eq("user_id", record.user_id)
    .eq("platform", "web");
  if (!tokens || tokens.length === 0) {
    res.status(200).json({ ok: true, delivered: 0 });
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const conversationId = record.data?.conversation_id;
  const url =
    record.kind === "call"
      ? "/app/calls"
      : typeof conversationId === "string"
        ? `/app/chats?c=${conversationId}`
        : "/app/chats";
  const message = JSON.stringify({
    title: record.title,
    body: record.body ?? "",
    tag: record.kind === "message" ? `chat:${conversationId ?? ""}` : undefined,
    kind: record.kind,
    url,
  });

  let delivered = 0;
  const expired: string[] = [];
  await Promise.all(
    tokens.map(async (row) => {
      try {
        await webpush.sendNotification(JSON.parse(row.token), message, { TTL: 3600 });
        delivered += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(row.id);
      }
    }),
  );
  if (expired.length > 0) await admin.from("push_tokens").delete().in("id", expired);
  res.status(200).json({ ok: true, delivered });
}
