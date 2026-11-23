import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { Hash, Loader2, Phone, Radio, Search, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

type GroupRow = {
  id: string;
  title: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
  last_message_at: string | null;
};
type CallRow = {
  id: string;
  kind: "voice" | "video";
  status: string;
  initiator_id: string;
  started_at: string;
  duration_seconds: number | null;
};
type StatusRow = {
  id: string;
  user_id: string;
  kind: string;
  body: string | null;
  created_at: string;
  expires_at: string;
};

export default function AdminContent({
  mode,
}: {
  mode: "groups" | "channels" | "calls" | "statuses";
}) {
  const [term, setTerm] = useState("");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (mode === "groups") {
      const { data } = await supabase
        .from("conversations")
        .select("id,title,description,created_by,created_at,last_message_at")
        .eq("type", "group")
        .order("created_at", { ascending: false })
        .limit(100);
      setGroups((data ?? []) as GroupRow[]);
    } else if (mode === "channels") {
      const { data } = await supabase
        .from("channels")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setChannels((data ?? []) as Channel[]);
    } else if (mode === "calls") {
      const { data } = await supabase
        .from("calls")
        .select("id,kind,status,initiator_id,started_at,duration_seconds")
        .order("started_at", { ascending: false })
        .limit(100);
      setCalls((data ?? []) as CallRow[]);
    } else {
      const { data } = await supabase
        .from("status_updates")
        .select("id,user_id,kind,body,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(100);
      setStatuses((data ?? []) as StatusRow[]);
    }
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const title =
    mode === "groups"
      ? "Groups"
      : mode === "channels"
        ? "Channels"
        : mode === "calls"
          ? "Calls"
          : "Status and content";
  const Icon =
    mode === "groups"
      ? UsersRound
      : mode === "channels"
        ? Hash
        : mode === "calls"
          ? Phone
          : Radio;
  const query = term.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.02em]">
          <Icon className="size-5 text-primary" /> {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live records from Supabase. Administrative access is checked by RLS and
          admin roles, not only by this page.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}`}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {mode === "groups" && (
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Group</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Last message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groups
                  .filter((group) =>
                    (group.title ?? "").toLowerCase().includes(query),
                  )
                  .map((group) => (
                    <tr key={group.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{group.title || "Untitled group"}</p>
                        <p className="mt-0.5 max-w-[280px] truncate text-muted-foreground">
                          {group.description || group.id}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(group.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {group.last_message_at
                          ? new Date(group.last_message_at).toLocaleString()
                          : "No messages"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {mode === "channels" && (
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Channel</th>
                  <th className="px-4 py-2.5 font-medium">Visibility</th>
                  <th className="px-4 py-2.5 font-medium">Verified</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {channels
                  .filter((channel) =>
                    `${channel.name} ${channel.username}`.toLowerCase().includes(query),
                  )
                  .map((channel) => (
                    <tr key={channel.id}>
                      <td className="px-4 py-3">
                        <Link
                          to={`/app/channels/${channel.id}`}
                          className="font-medium hover:underline"
                        >
                          {channel.name}
                        </Link>
                        <p className="text-muted-foreground">@{channel.username}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {channel.is_public ? "Public" : "Private"}
                      </td>
                      <td className="px-4 py-3">
                        {channel.is_verified ? "Verified" : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(channel.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {mode === "calls" && (
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calls
                  .filter((call) =>
                    `${call.kind} ${call.status}`.toLowerCase().includes(query),
                  )
                  .map((call) => (
                    <tr key={call.id}>
                      <td className="px-4 py-3 capitalize">{call.kind}</td>
                      <td className="px-4 py-3 capitalize">{call.status}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(call.started_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {call.duration_seconds != null
                          ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          {mode === "statuses" && (
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Author</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statuses
                  .filter((status) =>
                    `${status.kind} ${status.body ?? ""}`.toLowerCase().includes(query),
                  )
                  .map((status) => (
                    <tr key={status.id}>
                      <td className="px-4 py-3 font-mono text-[0.65rem]">
                        {status.user_id}
                      </td>
                      <td className="px-4 py-3 capitalize">{status.kind}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(status.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(status.expires_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
