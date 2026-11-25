import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Check,
  Loader2,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Mode = "otp" | "none";

export default function AdminSettings() {
  const [mode, setMode] = useState<Mode>("otp");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [selected, setSelected] = useState<Mode>("otp");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      "get_phone_registration_mode",
    );
    if (rpcError) {
      setError(
        rpcError.message.includes("function")
          ? "Apply migration 0020_messaging_experience.sql to manage phone registration."
          : rpcError.message,
      );
    } else {
      const value: Mode = data === "none" ? "none" : "otp";
      setMode(value);
      setSelected(value);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving || selected === mode) return;
    if (selected === "none" && !acknowledged) {
      setError("Confirm that you understand the reduced identity assurance first.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const { data, error: rpcError } = await supabase.rpc(
      "set_phone_registration_mode",
      {
        next_mode: selected,
        reason: reason.trim() || null,
      },
    );
    if (rpcError) {
      setError(
        /not authorized|permission/i.test(rpcError.message)
          ? "Your administrator role does not include settings.write."
          : rpcError.message,
      );
    } else {
      const value: Mode = data === "none" ? "none" : "otp";
      setMode(value);
      setSelected(value);
      setReason("");
      setAcknowledged(false);
      setNotice(
        value === "otp"
          ? "Phone verification is now required. New registrations must verify a code."
          : "No-SMS registration is now active. New accounts use a PIN or password for access.",
      );
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Platform settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authentication and launch configuration for this PINGO project. Every
          change is written to the administrator audit log.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Phone registration verification</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Choose how new phone numbers create accounts. The server enforces the
              selected mode for both registration and sign-in; this page cannot
              bypass it.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-5 flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                onClick={() => setSelected("otp")}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3.5 text-left",
                  selected === "otp"
                    ? "border-primary bg-accent/50"
                    : "border-border",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    selected === "otp"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {selected === "otp" && <Check className="size-2.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    OTP verification required
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    A WhatsApp or SMS code proves the number before the account is
                    created. Returning numbers resolve to the same Supabase user.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelected("none")}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3.5 text-left",
                  selected === "none"
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-border",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                    selected === "none"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-input",
                  )}
                >
                  {selected === "none" && <Check className="size-2.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    No SMS OTP required
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Registration accepts a phone number with a user-chosen PIN or
                    password. No code is sent; the credential is the only proof of
                    account access.
                  </span>
                </span>
              </button>
            </div>

            {selected === "none" && selected !== mode && (
              <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Disabling phone verification reduces identity assurance. A phone
                    number no longer proves ownership, and weak PINs make account
                    takeover easier. Existing accounts are not modified and keep
                    their current credentials and data, but new accounts created in
                    this mode cannot be recovered by SMS.
                  </span>
                </p>
                <label className="mt-3 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-0.5 size-4 accent-amber-600"
                  />
                  <span>
                    I understand and want registration without SMS verification.
                  </span>
                </label>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-medium text-muted-foreground">
                Reason for the change (optional, stored in the audit log)
              </label>
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 200))}
                placeholder="For example: staging environment without SMS"
                className="mt-1.5 h-9"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p className="mt-3 rounded-md bg-accent px-3 py-2 text-xs font-medium text-primary">
                {notice}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <Button
                onClick={() => void save()}
                disabled={saving || selected === mode}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save verification mode
              </Button>
              <span className="text-[0.68rem] text-muted-foreground">
                Current:{" "}
                {mode === "otp" ? "OTP verification required" : "No SMS OTP"}
              </span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">How both modes work</h2>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-muted-foreground">
              <li>
                Accounts always use a stable Supabase Auth user ID. The phone number
                is linked to that ID; the number itself is never the identity.
              </li>
              <li>
                OTP mode verifies the code server-side before a session is issued.
                No-SMS mode verifies a PIN or password hashed by Supabase Auth.
              </li>
              <li>
                Existing accounts, messages, groups, channels and statuses are never
                deleted or re-keyed when the mode changes.
              </li>
              <li>
                Changing back to OTP requires new registrations to verify; existing
                PIN accounts keep working until they re-verify.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Row Level Security</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          RLS is enabled for normal users. Migration{" "}
          <code className="font-mono">0007_restore_rls.sql</code> covers profiles,
          conversations, groups, channels, statuses and calls; later migrations add
          read-state, channel comments and audience policies. The browser uses only
          the publishable key, and privileged work runs in server routes that verify
          the caller&apos;s access token first.
        </p>
      </section>
    </div>
  );
}
