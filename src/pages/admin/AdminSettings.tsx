import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { FlaskConical, Loader2, MessageSquareCode, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminSettings() {
  const { adminRole } = useAuth();
  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_auth_mode");
    if (error) toast.error(error.message);
    setMode(data === "live" ? "live" : "test");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canChange =
    adminRole === "super_admin" || adminRole === "system_admin";

  async function change(next: "test" | "live") {
    if (next === mode) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("set_auth_mode", {
      next_mode: next,
      reason:
        next === "live"
          ? "Switched to live SMS codes"
          : "Switched to test sign-in without SMS",
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMode(data === "live" ? "live" : "test");
    toast.success(
      next === "live"
        ? "Live SMS mode enabled"
        : "Test mode enabled — no codes are sent",
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Platform settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authentication modes and launch switches. Changes are permission
          checked and audited.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageSquareCode className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold">Phone sign-in codes</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Test mode skips SMS entirely: any six digits sign a tester in.
              Live mode sends real codes through Supabase Auth and your connected
              SMS provider.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!canChange || busy}
            onClick={() => void change("test")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
              mode === "test"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <FlaskConical className="size-4 text-amber-500" />
              Test mode
              {mode === "test" && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[0.6rem] font-bold uppercase text-primary-foreground">
                  Active
                </span>
              )}
            </span>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">
              No SMS is sent. Enter any six-digit code to sign in. Requires
              Anonymous sign-ins to be enabled in Supabase. Use this while
              testing the app.
            </span>
          </button>

          <button
            type="button"
            disabled={!canChange || busy}
            onClick={() => void change("live")}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors disabled:opacity-60",
              mode === "live"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <Smartphone className="size-4 text-primary" />
              Live SMS
              {mode === "live" && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[0.6rem] font-bold uppercase text-primary-foreground">
                  Active
                </span>
              )}
            </span>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">
              Sends real one-time codes. Requires the Phone provider plus an SMS
              provider configured in Supabase, and a real phone number for every
              tester.
            </span>
          </button>
        </div>

        {!canChange && (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Your role can view this page but not change platform settings. Super
            admin and system admin can switch modes.
          </p>
        )}

        {busy && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Saving…
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold">Before switching to live SMS</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-muted-foreground">
          <li>Enable Phone authentication in Supabase → Authentication → Providers.</li>
          <li>Connect Twilio, MessageBird, Vonage or another supported SMS provider.</li>
          <li>Add the provider credentials in Supabase, never in this repository.</li>
          <li>Send yourself one real code before inviting testers.</li>
          <li>Switch back to test mode immediately if delivery fails.</li>
        </ol>
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[0.7rem] leading-5">
          Test mode is intentionally insecure. Only enable it while evaluating
          the product; it lets anyone with the URL reach the onboarding screen
          without proving a phone number.
        </p>
      </section>

      <Button variant="outline" size="sm" onClick={() => void load()}>
        Reload current mode
      </Button>
    </div>
  );
}
