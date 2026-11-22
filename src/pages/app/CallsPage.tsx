import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCall } from "@/providers/CallProvider";
import { Loader2, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { durationLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { watchChannel } from "@/lib/realtime";
import type { CallRecord, Profile } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function CallsPage() {
  const { profile } = useAuth();
  const { startCall } = useCall();
  const profileId = profile?.id;
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [callPeers, setCallPeers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
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

    const peerMap: Record<string, string> = {};
    const callIds = rows.map((row) => row.id);
    if (callIds.length > 0) {
      const { data: participants } = await supabase
        .from("call_participants")
        .select("call_id,user_id")
        .in("call_id", callIds);
      for (const participant of participants ?? []) {
        const row = participant as { call_id: string; user_id: string };
        if (row.user_id !== profileId && !peerMap[row.call_id]) {
          peerMap[row.call_id] = row.user_id;
        }
      }
    }
    setCallPeers(peerMap);

    const ids = Array.from(
      new Set([
        ...rows.map((row) => row.initiator_id),
        ...Object.values(peerMap),
      ]),
    );
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
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profileId) return;
    const channel = watchChannel("calls-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profileId]);

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-card px-4 sm:px-6">
        <div>
          <h1 className="text-[1.05rem] font-semibold tracking-[-0.01em]">Calls</h1>
          <p className="text-[0.68rem] text-muted-foreground">
            Real call records only
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6">
        <div className="rounded-lg border border-border bg-card p-3.5">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
              <Video className="size-4" />
            </span>
            <div>
              <p className="text-[0.82rem] font-semibold">1:1 calls are live over WebRTC</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Signalling uses private Supabase Realtime topics. Media is relayed
                by TURN when the network requires it; every outcome and duration is
                stored in Postgres. Group calls still require the SFU phase.
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
            <p className="mt-4 text-sm font-semibold">No calls yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Voice and video calls from your conversations will appear here with
              their real outcome and duration.
            </p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {calls.map((call) => {
              const outgoing = call.initiator_id === profile.id;
              const peerId =
                callPeers[call.id] ??
                (outgoing ? "" : call.initiator_id);
              const person = people[peerId] ?? people[call.initiator_id];
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
                  <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
                    {call.kind}
                  </Badge>
                  {call.conversation_id && peerId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-primary"
                      aria-label={`Call ${person?.display_name ?? "contact"} again`}
                      onClick={() =>
                        void startCall({
                          conversationId: call.conversation_id!,
                          kind: call.kind === "video" ? "video" : "voice",
                          peer: {
                            id: peerId,
                            display_name: person?.display_name,
                            username: person?.username,
                            avatar_path: person?.avatar_path,
                            public_avatar_url: person?.public_avatar_url,
                          },
                        })
                      }
                    >
                      {call.kind === "video" ? (
                        <Video className="size-4" />
                      ) : (
                        <Phone className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
