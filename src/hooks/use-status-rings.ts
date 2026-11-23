import { supabase } from "@/lib/supabase";
import { watchChannel } from "@/lib/realtime";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";

export type StatusRingState = "unseen" | "viewed";

/**
 * Active statuses grouped by author, with whether the signed-in user has seen
 * every active item. RLS limits both tables to statuses the user may view.
 */
export function useStatusRings() {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [rings, setRings] = useState<Record<string, StatusRingState>>({});

  useEffect(() => {
    if (!userId) {
      setRings({});
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const load = async () => {
      const now = new Date().toISOString();
      const { data: statuses } = await supabase
        .from("status_updates")
        .select("id,user_id")
        .gt("expires_at", now);
      const rows = statuses ?? [];
      if (rows.length === 0) {
        if (!cancelled) setRings({});
        return;
      }
      const { data: views } = await supabase
        .from("status_views")
        .select("status_id")
        .eq("viewer_id", userId);
      const seen = new Set((views ?? []).map((row) => row.status_id));
      const next: Record<string, StatusRingState> = {};
      for (const row of rows) {
        const author = row.user_id as string;
        if (next[author] === "unseen") continue;
        next[author] = seen.has(row.id as string) ? "viewed" : "unseen";
      }
      if (!cancelled) setRings(next);
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 350);
    };

    void load();
    const refresh = window.setInterval(() => void load(), 60_000);
    const channel = watchChannel("status-rings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_updates" },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_views" },
        schedule,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      window.clearInterval(refresh);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return rings;
}
