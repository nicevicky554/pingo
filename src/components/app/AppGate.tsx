import Onboarding from "@/pages/Onboarding";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Sits inside RequireAuth. Ensures a profile row exists and that the user has
 * claimed a username before using the app.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { profile, needsOnboarding, isLoading, refresh } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <main className="dot-grid flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-extrabold">Your profile is missing</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The database trigger that creates profiles may not be installed. Apply
            the migration in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[0.8em]">
              supabase/migrations
            </code>{" "}
            and try again.
          </p>
          <Button className="mt-5 w-full" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  if (needsOnboarding) return <Onboarding />;

  return children;
}
