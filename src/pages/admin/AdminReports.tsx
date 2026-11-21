import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { ModerationReportRow } from "@/pages/admin/types";
import { cn } from "@/lib/utils";
import { Flag, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const FILTERS = ["open", "reviewing", "resolved", "dismissed", "all"] as const;

export default function AdminReports() {
  const { profile: admin } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
  const [reports, setReports] = useState<ModerationReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ModerationReportRow | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("moderation_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(80);
    if (filter !== "all") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setReports((data ?? []) as ModerationReportRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(status: "resolved" | "dismissed") {
    if (!selected || !admin) return;
    if (note.trim().length < 3) {
      toast.error("Add a short resolution note.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("moderation_reports")
      .update({
        status,
        assigned_to: admin.id,
        resolution_note: note.trim(),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", selected.id);

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    await supabase.from("moderation_actions").insert({
      report_id: selected.id,
      admin_id: admin.id,
      action: status,
      notes: note.trim(),
    });

    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action: `report.${status}`,
      target_type: selected.target_type,
      target_id: selected.target_id,
      reason: note.trim(),
      result: "success",
    });

    toast.success(status === "resolved" ? "Report resolved" : "Report dismissed");
    setSelected(null);
    setNote("");
    setBusy(false);
    void load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Reports & moderation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every decision here is written to the audit log. Reporters never see
          internal notes.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize",
              filter === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          No reports in this queue.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {reports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => {
                setSelected(report);
                setNote(report.resolution_note ?? "");
              }}
              className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/40"
            >
              <Flag className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{report.reason}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {report.target_type} · {report.target_id}
                </p>
                {report.details && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {report.details}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-bold uppercase">
                  {report.status}
                </span>
                <p className="mt-1 text-[0.6rem] text-muted-foreground">
                  {new Date(report.created_at).toLocaleDateString()}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Moderation review</DialogTitle>
            <DialogDescription>
              {selected?.target_type} · {selected?.target_id}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Reason
                </p>
                <p className="mt-1 font-medium">{selected.reason}</p>
              </div>
              {selected.details && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Details
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                    {selected.details}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <span className="rounded-md bg-muted px-2 py-1 text-xs capitalize">
                  {selected.status}
                </span>
                <span className="rounded-md bg-muted px-2 py-1 text-xs">
                  {new Date(selected.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="resolution">Resolution note</Label>
            <Textarea
              id="resolution"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What did you decide, and why?"
              rows={3}
              className="mt-1.5"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={() => void resolve("dismissed")}
              disabled={busy || selected?.status === "dismissed"}
            >
              Dismiss
            </Button>
            <Button
              onClick={() => void resolve("resolved")}
              disabled={busy || selected?.status === "resolved"}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Resolve
            </Button>
          </div>

          <DialogFooter className="text-[0.65rem] text-muted-foreground">
            The action and the note are recorded against your admin account.
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
