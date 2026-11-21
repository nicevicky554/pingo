import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { AuditRow, RoleRow } from "@/pages/admin/types";
import type { Profile } from "@/lib/types";
import { Loader2, ShieldPlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const ROLES = [
  "super_admin",
  "system_admin",
  "security_admin",
  "moderator",
  "support_agent",
  "analytics_viewer",
];

export default function AdminAccess() {
  const { profile: admin, adminRole } = useAuth();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("moderator");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: logs } = await supabase
      .from("admin_audit_logs")
      .select("id,admin_id,action,target_type,target_id,reason,result,created_at")
      .order("created_at", { ascending: false })
      .limit(80);
    setAudit((logs ?? []) as AuditRow[]);

    const { data: assigned } = await supabase
      .from("admin_user_roles")
      .select("user_id,role,created_at");
    setRoles((assigned ?? []) as RoleRow[]);

    const ids = Array.from(
      new Set([
        ...(logs ?? []).map((row) => row.admin_id).filter(Boolean),
        ...(assigned ?? []).map((row) => row.user_id),
      ]),
    ) as string[];

    if (ids.length) {
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
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isSuperAdmin = adminRole === "super_admin";

  async function grantRole() {
    if (!admin || !isSuperAdmin) return;
    const clean = username.trim().replace(/^@/, "").toLowerCase();
    if (!clean) {
      toast.error("Enter the person's username.");
      return;
    }
    setBusy(true);
    const { data: target } = await supabase
      .from("profiles")
      .select("id,display_name,username")
      .eq("username", clean)
      .maybeSingle();

    if (!target) {
      toast.error("No account uses that username.");
      setBusy(false);
      return;
    }

    const { error } = await supabase.from("admin_user_roles").insert({
      user_id: target.id,
      role,
      granted_by: admin.id,
    });

    if (error) {
      toast.error(
        error.code === "23505"
          ? "That person already has this role."
          : error.message,
      );
      setBusy(false);
      return;
    }

    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action: "admin.role_grant",
      target_type: "admin_user",
      target_id: target.id,
      reason: `Granted ${role}`,
      metadata: { role },
    });

    toast.success(`Granted ${role.replace(/_/g, " ")} to @${clean}`);
    setUsername("");
    setBusy(false);
    void load();
  }

  async function revokeRole(row: RoleRow) {
    if (!admin || !isSuperAdmin) return;
    if (row.user_id === admin.id && row.role === "super_admin") {
      toast.error("You cannot remove your own super-admin role.");
      return;
    }
    const { error } = await supabase
      .from("admin_user_roles")
      .delete()
      .eq("user_id", row.user_id)
      .eq("role", row.role);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action: "admin.role_revoke",
      target_type: "admin_user",
      target_id: row.user_id,
      reason: `Removed ${row.role}`,
      metadata: { role: row.role },
    });
    toast.success("Role removed");
    void load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Audit & team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every administrative action is recorded. Audit rows cannot be edited
          through the API.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">Administrators</h2>
        </div>
        <div className="divide-y divide-border">
          {roles.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No roles assigned yet.
            </p>
          ) : (
            roles.map((row) => (
              <div
                key={`${row.user_id}-${row.role}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {people[row.user_id]?.display_name || "Unknown account"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{people[row.user_id]?.username ?? "unknown"} · granted{" "}
                    {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
                  {row.role.replace(/_/g, " ")}
                </span>
                {isSuperAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove role"
                    className="text-destructive"
                    onClick={() => void revokeRole(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {isSuperAdmin && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <ShieldPlus className="size-4 text-primary" /> Grant a role
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter an existing @username. Roles are enforced by server-side RLS,
            not by hiding buttons.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              className="sm:flex-1"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void grantRole()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Grant"}
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">Audit log</h2>
        </div>
        {audit.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No administrative actions recorded yet.
          </p>
        ) : (
          <div className="max-h-[28rem] divide-y divide-border overflow-y-auto">
            {audit.map((row) => (
              <div key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold">
                    {row.action}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-bold uppercase">
                    {row.result}
                  </span>
                  <span className="ml-auto text-[0.65rem] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {people[row.admin_id ?? ""]?.display_name ?? "System"} →{" "}
                  {row.target_type ?? "platform"}:{row.target_id ?? "—"}
                </p>
                {row.reason && (
                  <p className="mt-0.5 text-xs text-muted-foreground/90">
                    “{row.reason}”
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
