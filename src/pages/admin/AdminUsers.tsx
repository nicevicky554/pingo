import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { AdminProfileRow } from "@/pages/admin/types";
import { Loader2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export default function AdminUsers() {
  const { profile: admin, adminRole } = useAuth();
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState<AdminProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminProfileRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("profiles")
      .select("id,username,display_name,about,phone,status,suspended_reason,created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (term.trim()) {
      const clean = term.trim().replace(/^@/, "");
      query = query.or(
        `username.ilike.%${clean}%,display_name.ilike.%${clean}%`,
      );
    }

    const { data, error } = await query;
    if (error) toast.error(error.message);
    setUsers((data ?? []) as AdminProfileRow[]);
    setLoading(false);
  }, [term]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function setStatus(next: "active" | "suspended") {
    if (!selected || !admin) return;
    if (next === "suspended" && reason.trim().length < 4) {
      toast.error("Record a reason for the suspension.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        status: next,
        suspended_reason: next === "suspended" ? reason.trim() : null,
      })
      .eq("id", selected.id);

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action: next === "suspended" ? "user.suspend" : "user.restore",
      target_type: "user",
      target_id: selected.id,
      reason: reason.trim() || null,
      result: "success",
    });

    toast.success(
      next === "suspended" ? "Account suspended" : "Account restored",
    );
    setSelected(null);
    setReason("");
    setBusy(false);
    void load();
  }

  const canSuspend =
    adminRole === "super_admin" || adminRole === "security_admin";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search accounts, review status and apply restrictions. Passwords and
          keys are never exposed.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search name, @username…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No accounts match that search.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {users.map((user) => (
            <div key={user.id} className="flex items-center gap-3 p-3.5">
              <UserAvatar profile={user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {user.display_name || "Unnamed account"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{user.username ?? "no-username"} · joined{" "}
                  {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
              <Badge
                variant={
                  user.status === "active"
                    ? "secondary"
                    : user.status === "suspended"
                      ? "destructive"
                      : "outline"
                }
                className="capitalize"
              >
                {user.status}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelected(user);
                  setReason(user.suspended_reason ?? "");
                }}
                disabled={!canSuspend}
                title={
                  canSuspend
                    ? undefined
                    : "Your role cannot change account status"
                }
              >
                Review
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Account review</DialogTitle>
            <DialogDescription>
              {selected?.display_name || "Account"} · @{selected?.username}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-semibold capitalize">{selected.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{selected.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Internal ID</dt>
                <dd className="truncate font-mono text-xs">{selected.id}</dd>
              </div>
              {selected.suspended_reason && (
                <div>
                  <dt className="text-muted-foreground">Suspension reason</dt>
                  <dd className="mt-1 rounded-lg bg-muted px-3 py-2 text-xs">
                    {selected.suspended_reason}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div>
            <Label htmlFor="reason">Reason (recorded in the audit log)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain why this action is needed"
              rows={3}
              className="mt-1.5"
            />
          </div>

          <DialogFooter className="gap-2">
            {selected?.status === "active" ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void setStatus("suspended")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldAlert className="size-4" />
                )}
                Suspend account
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void setStatus("active")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                Restore account
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
