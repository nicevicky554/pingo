import { supabase } from "@/lib/supabase";

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function keyToBytes(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export const pushSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  Boolean(PUBLIC_KEY);

async function authorizedPost(body: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/** Registers this browser for Web Push. Requires granted notification permission. */
export async function subscribeToPush() {
  if (!pushSupported || !PUBLIC_KEY) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(PUBLIC_KEY),
      }));
    await authorizedPost({ subscription: subscription.toJSON() });
  } catch (error) {
    console.warn("[PINGO] push subscription failed", error);
  }
}

export async function unsubscribeFromPush() {
  if (!pushSupported) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await authorizedPost({ action: "unsubscribe", subscription: subscription.toJSON() });
    await subscription.unsubscribe();
  } catch (error) {
    console.warn("[PINGO] push unsubscribe failed", error);
  }
}
