import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { durationLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { CallRecord, Profile } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function CallsPage() {
  const { profile } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("calls")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as CallRecord[];
    setCalls(rows);
    const ids = Array.from(new Set(rows.map((row) => row.initiator_id)));
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", ids);
      setPeople(
        Object.fromEntries(
          ((profiles ?? []) as Profile[]).map((item) => [item.id, item]),
        ),
      );
    }
    setError(null);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("calls-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profile]);

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Phone className="size-5" />
        </span>
        <div>
          <h1 className="text-base font-extrabold">Calls</h1>
          <p className="text-[0.68rem] text-muted-foreground">
            Real call records only — no simulated connections
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Video className="size-4" />
            </span>
            <div>
              <p className="text-sm font-bold">1:1 calls are live over WebRTC</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Start a voice or video call from a direct conversation. Signalling
                travels over private Supabase Realtime topics and every outcome is
                written to the calls table. Add{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[0.65em]">
                  VITE_TURN_URL
                </code>{" "}
                (with username and credential) for reliable calls across strict
                networks. Group calls still require the SFU phase.
              </p>
            </div>
          </div>
        </div>

        <h2 className="mt-8 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Recent calls
        </h2>

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : calls.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Phone className="size-6" />
            </span>
            <p className="mt-4 text-sm font-bold">No calls yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              When the WebRTC layer ships, incoming, outgoing, missed and
              completed calls will appear here with their real duration.
            </p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {calls.map((call) => {
              const outgoing = call.initiator_id === profile.id;
              const person = people[call.initiator_id];
              const missed =
                call.status === "missed" ||
                call.status === "declined" ||
                call.status === "failed" ||
                call.status === "cancelled";
              const Icon = missed
                ? PhoneMissed
                : outgoing
                  ? PhoneOutgoing
                  : PhoneIncoming;
              return (
                <div key={call.id} className="flex items-center gap-3 p-3.5">
                  <UserAvatar profile={person} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {person?.display_name || "PINGO user"}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon
                        className={
                          missed ? "size-3.5 text-destructive" : "size-3.5 text-primary"
                        }
                      />
                      {outgoing ? "Outgoing" : "Incoming"} ·{" "}
                      {new Date(call.started_at).toLocaleString([], {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {call.duration_seconds
                        ? ` · ${durationLabel(call.duration_seconds)}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {call.kind}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
