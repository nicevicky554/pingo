import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { HardDrive, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

function useSettingsUpdate() {
  const { profile, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  async function update(patch: Record<string, unknown>) {
    if (!profile || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("user_settings")
      .update(patch)
      .eq("user_id", profile.id);
    setBusy(false);
    if (!error) await refresh();
  }
  return { update, busy };
}

function Choice({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function ChatsSettingsPage() {
  const { settings } = useAuth();
  const { update, busy } = useSettingsUpdate();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Chats" back="/app/settings" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Chat wallpaper</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Choice
              active={settings?.wallpaper !== "plain"}
              onClick={() => void update({ wallpaper: "dots" })}
            >
              PINGO dots
            </Choice>
            <Choice
              active={settings?.wallpaper === "plain"}
              onClick={() => void update({ wallpaper: "plain" })}
            >
              Plain
            </Choice>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Message text size</h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["sm", "md", "lg"] as const).map((size) => (
              <Choice
                key={size}
                active={(settings?.font_size ?? "md") === size}
                onClick={() => void update({ font_size: size })}
              >
                {size === "sm" ? "Small" : size === "md" ? "Default" : "Large"}
              </Choice>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Message previews</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Show message text in notifications and the chat list.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings?.message_preview !== false}
              onClick={() =>
                void update({ message_preview: settings?.message_preview === false })
              }
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                settings?.message_preview !== false ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all",
                  settings?.message_preview !== false ? "left-6" : "left-1",
                )}
              />
            </button>
          </div>
        </section>

        {busy && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Saving…
          </p>
        )}
      </div>
    </div>
  );
}

export function DevicesSettingsPage() {
  const { session } = useAuth();
  const [devices, setDevices] = useState<
    { id: string; name: string | null; platform: string | null; last_seen_at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("devices")
        .select("id,name,platform,last_seen_at")
        .order("last_seen_at", { ascending: false });
      setDevices(data ?? []);
      setLoading(false);
    };
    void load();
  }, []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Devices and sessions" back="/app/settings" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">This session</h2>
          <div className="mt-3 flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Smartphone className="size-[18px]" />
            </span>
            <div className="min-w-0 text-xs leading-5">
              <p className="font-medium text-foreground">Current browser</p>
              <p className="truncate text-muted-foreground">{navigator.userAgent}</p>
              <p className="mt-1 text-muted-foreground">
                Signed in as {session?.user.phone ?? "verified account"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Connected devices</h2>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : devices.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              No additional devices have registered yet. Web sessions use
              Supabase Auth; signing out ends this browser session.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {device.name || "PINGO device"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {device.platform || "Web"} ·{" "}
                      {new Date(device.last_seen_at).toLocaleString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Session tokens stay in Supabase Auth storage. PINGO never exposes a
          service-role or secret key to this browser.
        </p>
      </div>
    </div>
  );
}

export function StorageSettingsPage() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    navigator.storage.estimate().then((estimate) => {
      setUsage({ used: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
    });
  }, []);

  async function clearLocalCache() {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith("pingo:")) window.sessionStorage.removeItem(key);
    }
    setCleared(true);
  }

  const format = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(0, Math.round(bytes / 1024))} KB`;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Storage and data" back="/app/settings" />
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-primary">
              <HardDrive className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Browser storage</h2>
              <p className="text-xs text-muted-foreground">
                Actual origin storage reported by this browser.
              </p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Used</dt>
              <dd className="font-medium tabular-nums">
                {usage ? format(usage.used) : "Not reported"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Quota</dt>
              <dd className="font-medium tabular-nums">
                {usage ? format(usage.quota) : "Not reported"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Local cache</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Clears browser caches and saved drafts on this device. Messages and
            media in Supabase are not deleted.
          </p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void clearLocalCache()}
          >
            Clear local cache
          </Button>
          {cleared && (
            <p className="mt-2 text-xs font-medium text-online">
              Local cache cleared.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export function HelpSettingsPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Help and support" back="/app/settings" />
      <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-5">
        {[
          { to: "/guidelines", label: "Community guidelines" },
          { to: "/privacy", label: "Privacy policy" },
          { to: "/terms", label: "Terms of service" },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="block rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium transition-colors hover:bg-secondary/50"
          >
            {item.label}
          </Link>
        ))}
        <section className="rounded-xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground">
          To report a message, group, channel or account, open its profile/menu
          and choose Report. Reports enter the moderation queue with the
          reporter, target and timestamp.
        </section>
      </div>
    </div>
  );
}
