import { Wordmark } from "@/components/Wordmark";
import { Database, ExternalLink, KeyRound } from "lucide-react";

export function SetupNotice() {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8">
        <Wordmark showTagline />
        <h1 className="mt-8 text-3xl font-extrabold">Connect Supabase</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          PINGO stores every account, message and setting in Supabase. Two
          environment variables are needed before sign-in can work.
        </p>

        <ol className="mt-6 space-y-4 text-sm">
          <li className="flex gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Open this project's <strong>Keys</strong> tab and add{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.8em]">
                VITE_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.8em]">
                VITE_SUPABASE_ANON_KEY
              </code>{" "}
              from your Supabase project settings → API.
            </span>
          </li>
          <li className="flex gap-3">
            <Database className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Run the migrations in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.8em]">
                supabase/migrations/
              </code>{" "}
              (0001 then 0002) in the Supabase SQL editor, or via{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.8em]">
                supabase db push
              </code>
              . They create the schema, RLS policies, storage buckets, realtime
              authorization and the branding RPC.
            </span>
          </li>
          <li className="flex gap-3">
            <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Enable the <strong>Phone</strong> provider and an SMS provider,
              then disable <strong>Anonymous sign-ins</strong>. Testers use fixed
              numbers configured under Authentication → Phone → Test phone
              numbers; those are real Supabase users. PINGO never accepts an
              arbitrary six-digit code.
            </span>
          </li>
        </ol>

        <p className="mt-6 rounded-lg bg-muted px-4 py-3 text-xs leading-5 text-muted-foreground">
          Until both steps are complete this screen is shown instead of a broken
          application. No demo data or fake sessions are used.
        </p>
      </div>
    </main>
  );
}
