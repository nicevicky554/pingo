import { useAuth } from "@/hooks/use-auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: {
    conversation_id?: string;
    message_id?: string;
    call_id?: string;
  } | null;
  read_at: string | null;
  created_at: string;
};

type NotificationsContextValue = {
  items: NotificationRow[];
  unread: number;
  loading: boolean;
  permission: NotificationPermission | "unsupported";
  requestPermission: () => Promise<void>;
  markRead: (row: NotificationRow) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

/**
 * ONE notification channel for the whole app.
 *
 * Root cause of the previous crash: `AppShell` and `ChatsPage` both mounted a
 * NotificationsMenu, and both called supabase.channel("notifications:<id>").
 * supabase.channel() reuses an existing channel for the same topic, so the
 * second `.on("postgres_changes", ...)` was attached after subscribe() and
 * threw. A single owner also guarantees account switches clear old state.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );

  useEffect(() => {
    setItems([]);
    setLoading(Boolean(userId));
    if (!userId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (cancelled) return;
          const incoming = payload.new as NotificationRow;
          setItems((current) =>
            current.some((item) => item.id === incoming.id)
              ? current
              : [incoming, ...current].slice(0, 40),
          );
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            const options = {
              body: incoming.body ?? undefined,
              tag: incoming.id,
              icon: "/logo192.png",
              badge: "/logo192.png",
              data: { url: "/app/chats" },
            };
            // A service-worker notification is reliable on mobile browsers,
            // where the Notification constructor is often unavailable.
            if ("serviceWorker" in navigator) {
              void navigator.serviceWorker
                .getRegistration()
                .then((registration) => {
                  if (registration) {
                    return registration.showNotification(incoming.title, options);
                  }
                  new Notification(incoming.title, options);
                })
                .catch(() => {
                  try {
                    new Notification(incoming.title, options);
                  } catch {
                    // Notification output is optional.
                  }
                });
            } else {
              try {
                new Notification(incoming.title, options);
              } catch {
                // Notification output is optional.
              }
            }
          }
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[PINGO] notification subscription:", status, error);
        }
      });

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.warn("[PINGO] notifications load:", error.message);
        setItems((data ?? []) as NotificationRow[]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const markRead = useCallback(async (row: NotificationRow) => {
    if (row.read_at) return;
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) =>
        item.id === row.id ? { ...item, read_at: readAt } : item,
      ),
    );
    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", row.id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })),
    );
    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
  }, [userId]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      unread: items.filter((item) => !item.read_at).length,
      loading,
      permission,
      requestPermission,
      markRead,
      markAllRead,
    }),
    [items, loading, permission, requestPermission, markRead, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider");
  }
  return context;
}
