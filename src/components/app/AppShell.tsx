import { NotificationsMenu } from "@/components/NotificationsMenu";
import { UserAvatar } from "@/components/UserAvatar";
import { PingoMark } from "@/components/Wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  LogOut,
  MessageCircle,
  Phone,
  Radio,
  Settings,
  Shield,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";

const NAV = [
  { to: "/app/chats", label: "Chats", icon: MessageCircle },
  { to: "/app/updates", label: "Updates", icon: Radio },
  { to: "/app/communities", label: "Communities", icon: UsersRound },
  { to: "/app/calls", label: "Calls", icon: Phone },
];

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

function ProfileMenu() {
  const { profile, adminRole, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
          aria-label="Open your profile menu"
        >
          <UserAvatar profile={profile} size="sm" showPresence />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate font-semibold">
            {profile?.display_name || "Your profile"}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {profile?.username ? `@${profile.username}` : "Finish your profile"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/app/settings")}>
          <Settings className="size-4" /> Settings
        </DropdownMenuItem>
        {adminRole && (
          <DropdownMenuItem onSelect={() => navigate("/admin")}>
            <Shield className="size-4" /> Administration
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => void signOut().then(() => navigate("/"))}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const online = useConnectionStatus();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-4 md:flex">
        <NavLink
          to="/app/chats"
          aria-label="PINGO home"
          className="mb-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PingoMark className="size-10" />
        </NavLink>

        <nav className="flex flex-col items-center gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "group relative flex w-14 flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[0.62rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )
                }
              >
                <Icon className="size-[23px]" strokeWidth={2} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-3">
          <NotificationsMenu />
          <NavLink
            to="/app/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              cn(
                "flex size-10 items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-sidebar-accent text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )
            }
          >
            <Settings className="size-[22px]" aria-hidden="true" />
          </NavLink>
          <ProfileMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <WifiOff className="size-3.5" />
            You are offline. Messages will send when the connection returns.
          </div>
        )}
        <div className={cn("flex min-h-0 flex-1 flex-col pb-[57px] md:pb-0", className)}>
          {children}
        </div>
      </div>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-card/95 backdrop-blur md:hidden"
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[0.62rem] font-semibold transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-[23px]" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <NavLink
          to="/app/settings"
          className={({ isActive }) =>
            cn(
              "flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[0.62rem] font-semibold transition-colors",
              isActive ? "text-primary" : "text-muted-foreground",
            )
          }
        >
          <Settings className="size-[23px]" aria-hidden="true" />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
