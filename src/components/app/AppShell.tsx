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
  MessageSquare,
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
  { to: "/app/chats", label: "Chats", icon: MessageSquare },
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
          <span className="block truncate text-sm font-semibold">
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
  const { profile } = useAuth();

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[68px] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex">
        <NavLink
          to="/app/chats"
          aria-label="PINGO"
          className="mb-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PingoMark className="size-9" />
        </NavLink>

        <nav className="flex w-full flex-col items-center gap-0.5 px-1.5" aria-label="Primary">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "relative flex w-full flex-col items-center gap-1 rounded-md py-2 text-[0.58rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )
                }
              >
                <Icon className="size-[23px]" strokeWidth={1.9} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          <NotificationsMenu />
          <NavLink
            to="/app/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              cn(
                "flex size-10 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )
            }
          >
            <Settings className="size-[21px]" aria-hidden="true" />
          </NavLink>
          <ProfileMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-1.5 text-[0.7rem] font-medium text-amber-800 dark:text-amber-200">
            <WifiOff className="size-3.5" />
            No connection. Messages will send when you're back online.
          </div>
        )}
        <div className={cn("flex min-h-0 flex-1 flex-col pb-[76px] md:pb-0", className)}>
          {children}
        </div>
      </div>

      <nav
        className="glass safe-bottom fixed inset-x-3 bottom-2 z-40 flex items-stretch justify-around rounded-2xl px-1 py-1 md:hidden"
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
                  "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[0.58rem] font-medium transition-colors",
                  isActive
                    ? "bg-accent text-primary"
                    : "text-muted-foreground active:bg-secondary",
                )
              }
            >
              <Icon className="size-[21px]" strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <NavLink
          to={profile ? `/app/profile/${profile.id}` : "/app/settings"}
          aria-label="Your profile"
          className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1 text-[0.58rem] font-medium text-muted-foreground"
        >
          <span className="flex size-[27px] items-center justify-center">
            <UserAvatar profile={profile} size="xs" />
          </span>
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
