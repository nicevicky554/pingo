import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellRing,
  CheckCheck,
  MessageCircle,
  Phone,
  Radio,
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";

type NotificationRow = {
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

export function NotificationsMenu({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const incoming = payload.new as NotificationRow;
          setItems((current) =>
            current.some((item) => item.id === incoming.id)
              ? current
              : [incoming, ...current].slice(0, 30),
          );
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            new Notification(incoming.title, {
              body: incoming.body ?? undefined,
              tag: incoming.id,
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile]);

  async function markRead(row: NotificationRow) {
    if (!row.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", row.id);
      setItems((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
    }
    if (row.data?.conversation_id && row.kind === "message") {
      navigate(`/app/chats?c=${row.data.conversation_id}`);
    } else if (row.kind === "call") {
      navigate("/app/calls");
    }
  }

  async function markAllRead() {
    if (!profile) return;
    const now = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", profile.id)
      .is("read_at", null);
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? now })),
    );
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className={cn(
            "relative flex items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact
              ? "size-9 text-muted-foreground hover:bg-accent hover:text-foreground"
              : "size-10 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
          )}
        >
          {unread > 0 ? (
            <BellRing className="size-[22px]" />
          ) : (
            <Bell className="size-[22px]" />
          )}
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.55rem] leading-4 font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            No notifications yet. New messages and calls appear here.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((item) => {
              const Icon =
                item.kind === "call"
                  ? Phone
                  : item.kind === "status"
                    ? Radio
                    : MessageCircle;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item)}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/60",
                    !item.read_at && "bg-primary/[0.04]",
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-[0.6rem] text-muted-foreground">
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[0.7rem] leading-4 text-muted-foreground">
                      {item.body ?? "Notification"}
                    </span>
                  </span>
                  {!item.read_at && (
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={permission === "granted" || permission === "unsupported"}
          onSelect={async (event) => {
            event.preventDefault();
            if (typeof Notification === "undefined") return;
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result === "granted") void load();
          }}
        >
          <Bell className="size-4" />
          {permission === "granted"
            ? "Browser notifications enabled"
            : permission === "denied"
              ? "Browser notifications blocked"
              : "Enable browser notifications"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
