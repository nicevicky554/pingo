import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function AdminSetup() {
  const { profile, adminRole, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("claim_super_admin");
    if (rpcError) {
      setError(
        rpcError.message.includes("already exists")
          ? "An administrator already exists. Ask them to grant you a role."
          : rpcError.message,
      );
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
    navigate("/admin");
  }

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8">
        <Wordmark showTagline />
        <span className="mt-7 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">First administrator</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This one-time bootstrap grants the super-admin role to your account.
          It only works while no administrator exists, and the action is written
          to the audit log.
        </p>

        {adminRole ? (
          <div className="mt-5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
            You already hold the {adminRole.replace(/_/g, " ")} role.
          </div>
        ) : (
          <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
            Signed in as{" "}
            <span className="font-semibold text-foreground">
              {profile?.display_name || "your account"}
            </span>
            {profile?.username ? ` (@${profile.username})` : ""}.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          className="mt-5 w-full"
          onClick={() => (adminRole ? navigate("/admin") : void claim())}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShieldCheck className="size-4" />
          )}
          {adminRole ? "Open admin console" : "Claim super admin"}
        </Button>

        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link to="/app/chats">Back to PINGO</Link>
        </Button>
      </div>
    </main>
  );
}
