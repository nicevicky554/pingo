import { PageHeader } from "@/components/app/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Channel, Profile } from "@/lib/types";
import { Crown, Loader2, Shield, UserMinus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

type MemberRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
};

export default function ChannelMembersPage({
  mode,
}: {
  mode: "admins" | "subscribers";
}) {
  const { channelId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    const [{ data: channelRow }, { data: memberRows }] = await Promise.all([
      supabase.from("channels").select("*").eq("id", channelId).maybeSingle(),
      supabase
        .from("channel_members")
        .select("user_id,role,joined_at")
        .eq("channel_id", channelId)
        .order("joined_at", { ascending: true }),
    ]);
    setChannel((channelRow ?? null) as Channel | null);
    const rows = (memberRows ?? []) as MemberRow[];
    setMembers(rows);
    setMyRole(
      rows.find((row) => row.user_id === profile?.id)?.role ?? null,
    );
    if (rows.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", rows.map((row) => row.user_id));
      setPeople(
        Object.fromEntries(
          ((profiles ?? []) as Profile[]).map((person) => [person.id, person]),
        ),
      );
    }
    setLoading(false);
  }, [channelId, profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = Boolean(profile && channel && profile.id === channel.owner_id);
  const canManage = isOwner || myRole === "admin";
  const visible =
    mode === "admins"
      ? members.filter((member) => member.role !== "member")
      : members;

  async function setRole(userId: string, role: "admin" | "member") {
    if (!channelId || !canManage) return;
    setBusy(userId);
    const { error: updateError } = await supabase
      .from("channel_members")
      .update({ role })
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    setBusy(null);
    if (updateError) setError(updateError.message);
    else await load();
  }

  async function remove(userId: string) {
    if (!channelId || !canManage) return;
    if (!window.confirm("Remove this subscriber from the channel?")) return;
    setBusy(userId);
    const { error: removeError } = await supabase
      .from("channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    setBusy(null);
    if (removeError) setError(removeError.message);
    else await load();
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Channel unavailable</p>
        <Button variant="outline" onClick={() => navigate("/app/updates")}>
          Back to Updates
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader
        title={mode === "admins" ? "Channel administrators" : "Subscribers"}
        subtitle={channel.name}
        back={`/app/channels/${channel.id}`}
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        {!canManage && (
          <p className="rounded-lg bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
            Only the channel owner and administrators can change roles or remove
            subscribers.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            {error}
          </p>
        )}

        {mode === "subscribers" && canManage && (
          <p className="mb-3 text-xs text-muted-foreground">
            Promote a subscriber to administrator from the menu on their row.
          </p>
        )}

        <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {mode === "admins"
                ? "No administrators besides the owner yet."
                : "No subscribers yet."}
            </p>
          ) : (
            visible.map((member) => {
              const person = people[member.user_id];
              return (
                <div key={member.user_id} className="flex items-center gap-3 px-3.5 py-3">
                  <UserAvatar profile={person} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {person?.display_name || person?.username || "PINGO user"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{person?.username || "unknown"} ·{" "}
                      {member.role === "owner"
                        ? "Owner"
                        : member.role === "admin"
                          ? "Administrator"
                          : "Subscriber"}
                    </p>
                  </div>
                  {member.role === "owner" ? (
                    <Crown className="size-4 text-primary" aria-label="Owner" />
                  ) : canManage ? (
                    <div className="flex items-center gap-1">
                      {mode === "admins" || member.role === "admin" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === member.user_id}
                          onClick={() => void setRole(member.user_id, "member")}
                        >
                          Remove admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === member.user_id}
                          onClick={() => void setRole(member.user_id, "admin")}
                          aria-label="Promote to administrator"
                        >
                          <Shield className="size-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={busy === member.user_id}
                        onClick={() => void remove(member.user_id)}
                        aria-label="Remove subscriber"
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
