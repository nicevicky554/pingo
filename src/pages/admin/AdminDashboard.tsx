import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { ModerationReportRow } from "@/pages/admin/types";
import {
  Activity,
  Flag,
  Loader2,
  MessageSquare,
  PhoneCall,
  Radio,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

const STAT_META: {
  key: string;
  label: string;
  icon: typeof Users;
  hint?: string;
}[] = [
  { key: "users", label: "Registered users", icon: Users },
  { key: "active_users", label: "Active accounts", icon: Activity },
  { key: "new_users_7d", label: "New this week", icon: Users },
  { key: "messages", label: "Messages stored", icon: MessageSquare },
  { key: "messages_24h", label: "Messages (24h)", icon: MessageSquare },
  { key: "groups", label: "Groups", icon: UsersRound },
  { key: "channels", label: "Channels", icon: Radio },
  { key: "statuses", label: "Live statuses", icon: Radio },
  { key: "calls", label: "Calls attempted", icon: PhoneCall },
  { key: "reports_open", label: "Open reports", icon: Flag },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [reports, setReports] = useState<ModerationReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("admin_dashboard");
    if (rpcError) setError(rpcError.message);
    else setStats(data as Record<string, number>);

    const { data: reportRows } = await supabase
      .from("moderation_reports")
      .select("*")
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(6);
    setReports((reportRows ?? []) as ModerationReportRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Platform overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live aggregates from the Supabase database. Nothing on this page is
            hardcoded.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAT_META.map((meta) => {
          const Icon = meta.icon;
          return (
            <div
              key={meta.key}
              className="rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {meta.label}
                </span>
                <Icon className="size-3.5 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-extrabold tabular-nums">
                {stats?.[meta.key] ?? 0}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-bold">Open reports</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/reports">Review all</Link>
            </Button>
          </div>
          {reports.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No open reports.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((report) => (
                <li key={report.id} className="flex items-start gap-3 px-4 py-3">
                  <Flag className="mt-0.5 size-4 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{report.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.target_type} ·{" "}
                      {new Date(report.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase text-amber-700 dark:text-amber-300">
                    {report.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold">Security posture</h2>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
            <li className="flex justify-between gap-4">
              <span>Suspended accounts</span>
              <span className="font-semibold text-foreground">
                {stats?.suspended_users ?? 0}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Communities</span>
              <span className="font-semibold text-foreground">
                {stats?.communities ?? 0}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Completed calls</span>
              <span className="font-semibold text-foreground">
                {stats?.calls_completed ?? 0}
              </span>
            </li>
            <li className="flex justify-between gap-4">
              <span>Announcements</span>
              <span className="font-semibold text-foreground">
                {stats?.announcements ?? 0}
              </span>
            </li>
          </ul>
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[0.7rem] leading-5">
            These numbers come from the permission-checked{" "}
            <code>admin_dashboard()</code> function, not from the browser.
          </p>
        </section>
      </div>
    </div>
  );
}
