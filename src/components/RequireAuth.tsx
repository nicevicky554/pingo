import { SetupNotice } from "@/components/SetupNotice";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isSupabaseConfigured) {
    return <SetupNotice />;
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Wordmark />
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Connecting securely…</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, adminRole } = useAuth();
  const navigate = useNavigate();

  if (!isSupabaseConfigured) return <SetupNotice />;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth?returnTo=%2Fadmin" replace />;
  }

  if (!adminRole) {
    return (
      <main className="dot-grid flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-extrabold">Administration</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This console is restricted to PINGO staff. Your account does not
            have an administration role.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => navigate("/app/chats")}>
              Back to PINGO
            </Button>
            <Button variant="ghost" onClick={() => navigate("/admin/setup")}>
              First-admin setup
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
