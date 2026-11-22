import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Private topics (`conversation:<id>`, `user:<id>`, `presence:global`) must keep
 * their exact names because Realtime Authorization matches the topic string.
 * Supabase reuses a channel with the same topic, so a fast remount could hand
 * back an already-subscribed channel and `.on()` would throw. Tear down any
 * stale channel with the same topic before creating a fresh one.
 */
export function freshPrivateChannel(
  topic: string,
  config: { private: true; presence?: { key: string } },
): RealtimeChannel {
  const fullTopic = `realtime:${topic}`;
  for (const existing of supabase.getChannels()) {
    if (existing.topic === fullTopic) {
      void supabase.removeChannel(existing);
    }
  }
  return supabase.channel(topic, { config });
}

/** Public postgres_changes channels get a unique suffix so instances never share. */
export function watchChannel(name: string): RealtimeChannel {
  return supabase.channel(`${name}:${crypto.randomUUID()}`);
}
