import { PingoMark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  FileClock,
  Flag,
  Settings2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";

const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/reports", label: "Reports", icon: Flag },
  { to: "/admin/access", label: "Audit & team", icon: FileClock },
  { to: "/admin/settings", label: "Platform", icon: Settings2 },
  { to: "/admin/branding", label: "Branding", icon: Sparkles },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { profile, adminRole, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0d1820] text-white md:flex">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
          <PingoMark className="size-8" />
          <div>
            <p className="text-sm leading-none font-semibold tracking-[0.02em]">PINGO</p>
            <p className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.2em] text-white/45">
              Administration
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Administration">
          {ADMIN_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[0.82rem] font-medium transition-colors",
                    isActive
                      ? "bg-white/10 text-[#7cded1]"
                      : "text-white/55 hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <Icon className="size-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="rounded-md bg-white/5 px-3 py-2.5">
            <p className="truncate text-xs font-medium text-white/85">
              {profile?.display_name || "Administrator"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[0.62rem] capitalize text-white/45">
              <Shield className="size-3" />
              {adminRole?.replace(/_/g, " ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-2 text-white/50 hover:bg-white/5 hover:text-white"
            onClick={() => navigate("/app/chats")}
          >
            <ArrowLeft className="size-4" /> Back to PINGO
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-white/50 hover:bg-white/5 hover:text-white"
            onClick={() => void signOut().then(() => navigate("/"))}
          >
            Sign out
          </Button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:hidden">
          <div className="flex items-center gap-2">
            <PingoMark className="size-7" />
            <span className="text-sm font-extrabold">Admin</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/app/chats")}
            className="gap-1.5"
          >
            <ArrowLeft className="size-4" /> PINGO
          </Button>
        </header>

        <nav
          className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1.5 md:hidden"
          aria-label="Administration"
        >
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
          <NavLink
            to="/admin/setup"
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            Setup
          </NavLink>
        </nav>

        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
