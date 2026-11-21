import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const PresenceContext = createContext<{ online: Set<string> }>({
  online: new Set(),
});

/**
 * Tracks genuine live presence over Supabase Realtime Presence.
 * A user only appears online while at least one authenticated client is
 * connected and tracking a heartbeat — never because the account exists.
 */
export function PresenceProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setOnline(new Set());
      return;
    }

    const channel = supabase.channel("presence:global", {
      config: {
        private: true,
        presence: { key: userId },
      },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      setOnline(new Set());
    };
  }, [userId]);

  const value = useMemo(() => ({ online }), [online]);
  return (
    <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}
