import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { BadgeCheck, Hash, Loader2, Search, ShieldX, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type UserRow = {
  id: string;
  display_name: string;
  username: string | null;
  is_verified: boolean;
};
type ChannelRow = {
  id: string;
  name: string;
  username: string;
  is_verified: boolean;
};
type RequestRow = {
  id: string;
  subject_type: "user" | "channel";
  subject_id: string;
  requester_id: string;
  status: string;
  reason: string | null;
  created_at: string;
};

export default function AdminVerification() {
  const { adminRole } = useAuth();
  const [term, setTerm] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const canManage =
    adminRole === "super_admin" ||
    adminRole === "system_admin" ||
    adminRole === "security_admin";

  const load = useCallback(async () => {
    setLoading(true);
    const query = term.trim();
    let userQuery = supabase
      .from("profiles")
      .select("id,display_name,username,is_verified")
      .order("created_at", { ascending: false })
      .limit(20);
    let channelQuery = supabase
      .from("channels")
      .select("id,name,username,is_verified")
      .order("created_at", { ascending: false })
      .limit(20);
    if (query.length >= 2) {
      userQuery = userQuery.or(
        `display_name.ilike.%${query}%,username.ilike.%${query}%`,
      );
      channelQuery = channelQuery.or(
        `name.ilike.%${query}%,username.ilike.%${query}%`,
      );
    }
    const [{ data: userRows }, { data: channelRows }, { data: requestRows }] =
      await Promise.all([
        userQuery,
        channelQuery,
        supabase
          .from("verification_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
    setUsers((userRows ?? []) as UserRow[]);
    setChannels((channelRows ?? []) as ChannelRow[]);
    setRequests((requestRows ?? []) as RequestRow[]);
    setLoading(false);
  }, [term]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function toggle(
    subjectType: "user" | "channel",
    subjectId: string,
    verified: boolean,
  ) {
    if (!canManage) return;
    setBusy(`${subjectType}:${subjectId}`);
    const { error } = await supabase.rpc("set_verification", {
      subject_type: subjectType,
      subject_id: subjectId,
      verified,
      reason: verified
        ? "Approved in admin verification"
        : "Verification revoked in admin",
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(verified ? "Verification granted." : "Verification revoked.");
    void load();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant or revoke user and channel badges. Every change is written to
          the audit log through the server-side RPC.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search name, username or channel"
          className="pl-9"
        />
      </div>

      {!canManage && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Your role can review this page but not change verification.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Users className="size-4 text-primary" /> Users
            </h2>
            <div className="divide-y divide-border">
              {users.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground">No users found.</p>
              ) : (
                users.map((user) => (
                  <div key={user.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {user.display_name || "Unnamed user"}
                        <VerifiedBadge verified={user.is_verified} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{user.username || "no-username"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={user.is_verified ? "outline" : "default"}
                      disabled={!canManage || busy === `user:${user.id}`}
                      onClick={() => void toggle("user", user.id, !user.is_verified)}
                    >
                      {user.is_verified ? (
                        <ShieldX className="size-3.5" />
                      ) : (
                        <BadgeCheck className="size-3.5" />
                      )}
                      {user.is_verified ? "Revoke" : "Verify"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
              <Hash className="size-4 text-primary" /> Channels
            </h2>
            <div className="divide-y divide-border">
              {channels.length === 0 ? (
                <p className="px-4 py-6 text-xs text-muted-foreground">
                  No channels found.
                </p>
              ) : (
                channels.map((channel) => (
                  <div key={channel.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {channel.name}
                        <VerifiedBadge verified={channel.is_verified} />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        @{channel.username}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={channel.is_verified ? "outline" : "default"}
                      disabled={!canManage || busy === `channel:${channel.id}`}
                      onClick={() =>
                        void toggle("channel", channel.id, !channel.is_verified)
                      }
                    >
                      {channel.is_verified ? (
                        <ShieldX className="size-3.5" />
                      ) : (
                        <BadgeCheck className="size-3.5" />
                      )}
                      {channel.is_verified ? "Revoke" : "Verify"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          Recent requests
        </h2>
        {requests.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            No verification requests yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs"
              >
                <span className="font-medium capitalize">{request.subject_type}</span>
                <span className="font-mono text-[0.65rem] text-muted-foreground">
                  {request.subject_id}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 capitalize">
                  {request.status}
                </span>
                <span className="text-muted-foreground">
                  {new Date(request.created_at).toLocaleString()}
                </span>
                {request.reason && (
                  <span className="w-full text-muted-foreground">{request.reason}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
