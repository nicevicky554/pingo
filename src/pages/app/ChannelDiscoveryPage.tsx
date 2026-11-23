import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { Hash, Loader2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

type ChannelWithPreview = Channel & { latest_post?: string | null };

export default function ChannelDiscoveryPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<ChannelWithPreview[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: rows, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (channelError) setError(channelError.message);
    const list = (rows ?? []) as ChannelWithPreview[];
    if (list.length > 0) {
      const { data: posts } = await supabase
        .from("channel_posts")
        .select("channel_id,body,created_at")
        .in("channel_id", list.map((channel) => channel.id))
        .order("created_at", { ascending: false });
      const latest = new Map<string, string>();
      for (const post of posts ?? []) {
        if (!latest.has(post.channel_id)) latest.set(post.channel_id, post.body ?? "");
      }
      for (const channel of list) channel.latest_post = latest.get(channel.id) ?? null;
    }
    setChannels(list);

    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", profile.id);
    setFollowed(new Set((memberships ?? []).map((row) => row.channel_id)));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow(channel: Channel) {
    if (!profile) return;
    const isFollowing = followed.has(channel.id);
    const request = isFollowing
      ? supabase
          .from("channel_members")
          .delete()
          .eq("channel_id", channel.id)
          .eq("user_id", profile.id)
      : supabase
          .from("channel_members")
          .insert({ channel_id: channel.id, user_id: profile.id });
    const { error: followError } = await request;
    if (followError) {
      setError(followError.message);
      return;
    }
    setFollowed((current) => {
      const next = new Set(current);
      if (isFollowing) next.delete(channel.id);
      else next.add(channel.id);
      return next;
    });
  }

  const visible = channels.filter((channel) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      channel.name.toLowerCase().includes(query) ||
      channel.username.toLowerCase().includes(query) ||
      (channel.description ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader
        title="Channels"
        back="/app/updates"
        actions={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/app/channels/create")}
          >
            <Plus className="size-4" /> Create
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search public channels"
            className="h-10 pl-9"
            aria-label="Search public channels"
          />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <Hash className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {search ? "No channels match" : "No public channels yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search
                ? "Try another name or @username."
                : "Create the first public channel for people to discover."}
            </p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {visible.map((channel) => {
              const isFollowing = followed.has(channel.id);
              return (
                <div key={channel.id} className="flex items-center gap-3 px-3.5 py-3">
                  <Link
                    to={`/app/channels/${channel.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary">
                      {channel.avatar_url ? (
                        <img
                          src={channel.avatar_url}
                          alt={channel.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <Hash className="size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {channel.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{channel.username}
                        {channel.description ? ` · ${channel.description}` : ""}
                      </span>
                      {channel.latest_post && (
                        <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
                          {channel.latest_post}
                        </span>
                      )}
                    </span>
                  </Link>
                  <Button
                    size="sm"
                    variant={isFollowing ? "outline" : "default"}
                    onClick={() => void toggleFollow(channel)}
                  >
                    {isFollowing ? "Unfollow" : "Follow"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
