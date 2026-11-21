import { PingoMark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BarChart3,
  FileClock,
  Flag,
  Shield,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";

const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: BarChart3, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/reports", label: "Reports", icon: Flag },
  { to: "/admin/access", label: "Audit & team", icon: FileClock },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { profile, adminRole, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <PingoMark className="size-8" />
          <div>
            <p className="text-sm leading-none font-extrabold">PINGO</p>
            <p className="mt-1 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-muted-foreground">
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
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )
                }
              >
                <Icon className="size-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="truncate text-xs font-semibold">
              {profile?.display_name || "Administrator"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-[0.65rem] capitalize text-muted-foreground">
              <Shield className="size-3" />
              {adminRole?.replace(/_/g, " ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-start gap-2 text-muted-foreground"
            onClick={() => navigate("/app/chats")}
          >
            <ArrowLeft className="size-4" /> Back to PINGO
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
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
