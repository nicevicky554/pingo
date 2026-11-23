import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/providers/BrandingProvider";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import {
  Bell,
  BellOff,
  Hash,
  Loader2,
  PenSquare,
  Share2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

type Post = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string | null;
  media_path: string | null;
  pinned: boolean;
  published_at: string | null;
  views: number;
  created_at: string;
};

export default function ChannelPage() {
  const { channelId } = useParams();
  const { profile } = useAuth();
  const { assets } = useBranding();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [subscribers, setSubscribers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    const { data, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle();
    if (channelError) setError(channelError.message);
    setChannel((data ?? null) as Channel | null);

    const { data: postRows } = await supabase
      .from("channel_posts")
      .select("*")
      .eq("channel_id", channelId)
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(50);
    setPosts((postRows ?? []) as Post[]);

    const { count } = await supabase
      .from("channel_members")
      .select("user_id", { count: "exact", head: true })
      .eq("channel_id", channelId);
    setSubscribers(count ?? 0);

    if (profile) {
      const { data: membership } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channelId)
        .eq("user_id", profile.id)
        .maybeSingle();
      setFollowing(Boolean(membership));
    }
    setLoading(false);
  }, [channelId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile || !channel || busy) return;
    if (channel.owner_id === profile.id) return;
    setBusy(true);
    if (following) {
      await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", profile.id);
      setFollowing(false);
      setSubscribers((current) => Math.max(0, current - 1));
    } else {
      const { error: insertError } = await supabase
        .from("channel_members")
        .insert({ channel_id: channel.id, user_id: profile.id });
      if (insertError) setError(insertError.message);
      else {
        setFollowing(true);
        setSubscribers((current) => current + 1);
      }
    }
    setBusy(false);
  }

  async function share() {
    if (!channel) return;
    const url = `${window.location.origin}/app/channels/${channel.id}`;
    if (navigator.share) {
      await navigator.share({ title: channel.name, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      setError("Channel link copied.");
    }
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
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium">Channel unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">
          It may be private or no longer exist.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/app/updates")}>
          Back to Updates
        </Button>
      </div>
    );
  }

  const isOwner = profile?.id === channel.owner_id;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title={channel.name} back="/app/updates" />

      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border">
            {channel.avatar_url || assets.default_channel_url ? (
              <img
                src={channel.avatar_url ?? assets.default_channel_url}
                alt={channel.name}
                className="size-full object-cover"
              />
            ) : (
              <Hash className="size-9" />
            )}
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em]">{channel.name}</h2>
          <p className="text-sm text-muted-foreground">@{channel.username}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {subscribers.toLocaleString()} subscriber{subscribers === 1 ? "" : "s"} ·{" "}
            {channel.is_public ? "Public" : "Private"}
          </p>
          {channel.description && (
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              {channel.description}
            </p>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          {isOwner ? (
            <Button
              className="flex-1 gap-2"
              onClick={() => navigate(`/app/channels/${channel.id}/compose`)}
            >
              <PenSquare className="size-4" /> Create post
            </Button>
          ) : (
            <Button
              className="flex-1 gap-2"
              variant={following ? "outline" : "default"}
              onClick={() => void toggleFollow()}
              disabled={busy}
            >
              {following ? <BellOff className="size-4" /> : <Bell className="size-4" />}
              {following ? "Unsubscribe" : "Subscribe"}
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => void share()} aria-label="Share channel">
            <Share2 className="size-4" />
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {error}
          </p>
        )}

        <div className="mt-6 space-y-3">
          {posts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <Hash className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No posts yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isOwner
                  ? "Publish the first post from the channel composer."
                  : "Posts from this channel will appear here."}
              </p>
              {isOwner && (
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => navigate(`/app/channels/${channel.id}/compose`)}
                >
                  Create post
                </Button>
              )}
            </div>
          ) : (
            posts.map((post) => <ChannelPostCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ChannelPostCard({ post }: { post: Post }) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);

  useEffect(() => {
    if (!post.media_path) return;
    let active = true;
    (async () => {
      const { data } = await supabase.storage
        .from("channel-media")
        .createSignedUrl(post.media_path!, 3600);
      if (active && data?.signedUrl) {
        setMediaUrl(data.signedUrl);
        setIsImage(/\.(png|jpe?g|gif|webp|avif)$/i.test(post.media_path!));
      }
    })();
    return () => {
      active = false;
    };
  }, [post.media_path]);

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between text-[0.65rem] text-muted-foreground">
        <span>
          {post.published_at
            ? new Date(post.published_at).toLocaleString([], {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Scheduled"}
        </span>
        <span>{post.views.toLocaleString()} views</span>
      </div>
      {post.body && (
        <p className="mt-2 text-sm leading-6 whitespace-pre-wrap break-words">{post.body}</p>
      )}
      {mediaUrl &&
        (isImage ? (
          <img
            src={mediaUrl}
            alt="Channel attachment"
            className="mt-3 max-h-96 w-full rounded-md object-cover"
          />
        ) : (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block rounded-md bg-secondary px-3 py-2 text-xs font-medium text-primary"
          >
            Open attachment
          </a>
        ))}
    </article>
  );
}
