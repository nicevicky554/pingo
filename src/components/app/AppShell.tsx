import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import { useBranding } from "@/providers/BrandingProvider";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  Phone,
  Radio,
  Settings,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { watchChannel } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";

const NAV = [
  { to: "/app/chats", label: "Chats", icon: MessageSquare, asset: "nav_chats_url" },
  { to: "/app/updates", label: "Updates", icon: Radio, asset: "nav_updates_url" },
  {
    to: "/app/communities",
    label: "Communities",
    icon: UsersRound,
    asset: "nav_communities_url",
  },
  { to: "/app/calls", label: "Calls", icon: Phone, asset: "nav_calls_url" },
  { to: "/app/settings", label: "Settings", icon: Settings, asset: "nav_settings_url" },
] as const;

function useUnreadChats(userId: string | undefined) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!userId) {
      setUnread(0);
      return;
    }
    let timer: number | null = null;
    const load = async () => {
      const { data } = await supabase
        .from("conversation_list")
        .select("unread")
        .eq("user_id", userId);
      setUnread(
        (data ?? []).reduce(
          (sum, row) => sum + (Number((row as { unread?: number }).unread) || 0),
          0,
        ),
      );
    };
    void load();
    const channel = watchChannel("nav-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          if (timer) window.clearTimeout(timer);
          timer = window.setTimeout(() => void load(), 400);
        },
      )
      .subscribe();
    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);
  return unread;
}

function useConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const online = useConnectionStatus();
  const { profile } = useAuth();
  const location = useLocation();
  const unreadChats = useUnreadChats(profile?.id);
  const { assets } = useBranding();
  const statusRings = useStatusRings();
  const unseenStatuses = Object.entries(statusRings).filter(
    ([userId, state]) => state === "unseen" && userId !== profile?.id,
  ).length;

  const inConversation =
    location.pathname === "/app/chats" &&
    new URLSearchParams(location.search).has("c");
  const focusedWorkflow = [
    "/app/new/message",
    "/app/search",
    "/app/profile/",
    "/app/groups/",
    "/app/channels/",
    "/app/communities/create",
    "/app/updates/create",
    "/app/settings/",
    "/app/channels/",
    "/app/updates/",
    "/app/calls/",
    "/app/new/",
  ].some((prefix) => location.pathname.startsWith(prefix));
  const hidePrimaryNav = inConversation || focusedWorkflow;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="liquid-glass-rail hidden w-[68px] shrink-0 flex-col items-center py-3 md:flex">
        <NavLink
          to="/app/chats"
          aria-label="PINGO"
          className="mb-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo kind="logo" className="size-9 rounded-lg" />
        </NavLink>

        <nav className="flex w-full flex-col items-center gap-0.5 px-1.5" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            const badge =
              item.to === "/app/chats"
                ? unreadChats
                : item.to === "/app/updates"
                  ? unseenStatuses
                  : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "liquid-nav-item relative flex w-full flex-col items-center gap-1 rounded-[18px] py-2 text-[0.58rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive && "liquid-nav-active",
                  )
                }
              >
                <span className="relative">
                  {assets[item.asset] ? (
                    <img
                      src={assets[item.asset]}
                      alt=""
                      className="size-[23px] object-contain"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon className="size-[23px]" strokeWidth={1.9} aria-hidden="true" />
                  )}
                  {item.to === "/app/updates" && badge > 0 ? (
                    <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary ring-2 ring-card" />
                  ) : badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[14px] rounded-full bg-primary px-1 text-center text-[0.52rem] leading-[14px] font-semibold text-primary-foreground">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-[0.7rem] font-medium text-amber-800 dark:text-amber-200">
            <WifiOff className="size-3.5" />
            No connection. Messages will send when you're back online.
          </div>
        )}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col md:pb-0",
            hidePrimaryNav ? "pb-0" : "pb-[76px]",
            className,
          )}
        >
          {children}
        </div>
      </div>

      <nav
        className={cn(
          "liquid-glass-nav safe-bottom fixed inset-x-3 bottom-2 z-40 flex items-stretch justify-around px-1.5 pt-1.5 md:hidden",
          hidePrimaryNav && "hidden",
        )}
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const badge =
            item.to === "/app/chats"
              ? unreadChats
              : item.to === "/app/updates"
                ? unseenStatuses
                : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "liquid-nav-item relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[18px] py-1.5 text-[0.56rem] font-medium",
                  isActive && "liquid-nav-active",
                )
              }
            >
              <span className="relative">
                {assets[item.asset] ? (
                  <img
                    src={assets[item.asset]}
                    alt=""
                    className="size-[20px] object-contain"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon className="size-[20px]" strokeWidth={1.9} aria-hidden="true" />
                )}
                {item.to === "/app/updates" && badge > 0 ? (
                  <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary ring-2 ring-card" />
                ) : badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[15px] rounded-full bg-primary px-1 text-center text-[0.55rem] leading-[15px] font-semibold text-primary-foreground shadow-sm">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
