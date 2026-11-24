/**
 * POST /api/push/subscribe
 *
 * Stores (or removes) the caller's Web Push subscription in public.push_tokens.
 * The user id always comes from the verified access token, never the body.
 */
import { rateLimit } from "../_lib/rate-limit";
import {
  authenticate,
  readJson,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/supabase-admin";

type Subscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const auth = await authenticate(req, res, {
    signInMessage: "Sign in to manage notifications.",
  });
  if (!auth) return;
  const { admin, user } = auth;

  const limit = await rateLimit(`pingo:push-sub:${user.id}`, 20, 60);
  if (!limit.allowed) {
    res.status(429).json({ error: "Too many requests." });
    return;
  }

  const body = readJson(req);
  const subscription = body.subscription as Subscription | undefined;
  const endpoint =
    typeof subscription?.endpoint === "string" ? subscription.endpoint : "";
  if (!endpoint.startsWith("https://")) {
    res.status(400).json({ error: "Invalid push subscription." });
    return;
  }

  if (body.action === "unsubscribe") {
    const { data: rows } = await admin
      .from("push_tokens")
      .select("id,token")
      .eq("user_id", user.id)
      .eq("platform", "web");
    const ids = (rows ?? [])
      .filter((row) => String(row.token).includes(endpoint))
      .map((row) => row.id);
    if (ids.length > 0) await admin.from("push_tokens").delete().in("id", ids);
    res.status(200).json({ ok: true });
    return;
  }

  if (
    typeof subscription?.keys?.p256dh !== "string" ||
    typeof subscription?.keys?.auth !== "string"
  ) {
    res.status(400).json({ error: "Invalid push subscription keys." });
    return;
  }

  const token = JSON.stringify({
    endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
  });
  const { error } = await admin
    .from("push_tokens")
    .upsert({ user_id: user.id, token, platform: "web" }, { onConflict: "user_id,token" });
  if (error) {
    res.status(500).json({ error: "The subscription could not be saved." });
    return;
  }
  res.status(200).json({ ok: true });
}
