import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import AuthPage from "@/pages/Auth";
import Onboarding from "@/pages/Onboarding";
import { BrandSplash } from "@/components/BrandSplash";
import { Navigate, useSearchParams } from "react-router";

/**
 * "/" is the application entry point, not a marketing page.
 * signed out → phone sign-in · incomplete profile → setup · otherwise → chats.
 */
export default function Home() {
  const { isLoading, isAuthenticated, needsOnboarding, profile, refresh } =
    useAuth();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("returnTo");
  const destination =
    requested && /^\/(app|admin)(\/|$)/.test(requested) && !requested.startsWith("//")
      ? requested
      : "/app/chats";

  if (!isSupabaseConfigured) return <SetupNotice />;

  if (isLoading) {
    return <BrandSplash />;
  }

  if (!isAuthenticated) return <AuthPage />;
  if (needsOnboarding) return <Onboarding />;

  if (!profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold">Profile unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your account exists but its profile could not be read. Apply both
            Supabase migrations, then retry.
          </p>
          <Button className="mt-5 w-full" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  return <Navigate to={destination} replace />;
}
