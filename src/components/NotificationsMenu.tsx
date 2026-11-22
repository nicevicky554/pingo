import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/providers/NotificationsProvider";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellRing,
  CheckCheck,
  Loader2,
  MessageCircle,
  Phone,
  Radio,
} from "lucide-react";
import { useNavigate } from "react-router";

export function NotificationsMenu({ compact = false }: { compact?: boolean }) {
  const {
    items,
    unread,
    loading,
    permission,
    requestPermission,
    markRead,
    markAllRead,
  } = useNotifications();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className={cn(
            "relative flex items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact
              ? "size-9 text-muted-foreground hover:bg-secondary hover:text-foreground"
              : "size-10 text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {unread > 0 ? (
            <BellRing className="size-[22px]" />
          ) : (
            <Bell className="size-[22px]" />
          )}
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--online)] px-1 text-[0.55rem] leading-4 font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-sm">
            Notifications
          </DropdownMenuLabel>
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
                  onClick={() => {
                    void markRead(item);
                    if (item.data?.conversation_id && item.kind === "message") {
                      navigate(`/app/chats?c=${item.data.conversation_id}`);
                    } else if (item.kind === "call") {
                      navigate("/app/calls");
                    }
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-secondary",
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
          onSelect={(event) => {
            event.preventDefault();
            void requestPermission();
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
