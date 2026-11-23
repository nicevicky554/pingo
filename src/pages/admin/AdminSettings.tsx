import { ShieldCheck, Smartphone } from "lucide-react";

/**
 * Authentication is no longer switchable from the app. Supabase phone OTP is
 * the only path; test numbers are configured in the Supabase dashboard and
 * produce real auth.users rows, never anonymous users.
 */
export default function AdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Platform settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Phone authentication and launch configuration for this PINGO project.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Phone OTP only</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              PINGO uses Supabase Phone Auth for every account. There is no
              anonymous sign-in and no in-app “accept any six digits” mode.
              Supabase creates the user on the first verified code and restores
              the same <code className="font-mono">auth.users</code> row on later
              sign-ins.
            </p>
          </div>
        </div>

        <ol className="mt-5 list-decimal space-y-2 pl-5 text-xs leading-5 text-muted-foreground">
          <li>
            In Supabase, open <strong>Authentication → Providers → Phone</strong>{" "}
            and enable it with an SMS provider.
          </li>
          <li>
            Turn <strong>Anonymous sign-ins off</strong> in Authentication →
            Providers. PINGO never calls{" "}
            <code className="font-mono">signInAnonymously</code>.
          </li>
          <li>
            For testers, add fixed numbers and codes under{" "}
            <strong>Authentication → Phone → Test phone numbers</strong>. Those
            still produce real Supabase users.
          </li>
          <li>
            Keep the SMS provider secrets inside Supabase. Never put them in a{" "}
            <code className="font-mono">VITE_</code> variable.
          </li>
        </ol>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Row Level Security</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Migration <code className="font-mono">0007_restore_rls.sql</code>{" "}
              re-enables RLS and recreates the policies for profiles,
              conversations, messages, groups, channels, statuses, calls, admin
              tables, Storage and Realtime. Normal browser requests run with the
              publishable key and the signed-in user&apos;s identity.
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The Supabase secret key is never imported into the Vite client. If
              a privileged server task is added later, it must verify the user
              token separately before using a server-only client.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
