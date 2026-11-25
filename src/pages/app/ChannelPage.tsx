import { ChannelPostCard, postMediaPaths } from "@/components/channel/ChannelPostCard";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/providers/BrandingProvider";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  Hash,
  Info,
  Link2,
  Loader2,
  Lock,
  MoreVertical,
  PenSquare,
  Pin,
  Share2,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

type Post = {
  id: string;
  channel_id: string;
  author_id: string;
  body: string | null;
  media_path: string | null;
  media_paths?: string[] | null;
  media_meta?: { name?: string; size?: number; mime?: string }[] | null;
  link_url?: string | null;
  pinned: boolean;
  pinned_at?: string | null;
  published_at: string | null;
  views: number;
  created_at: string;
};

export default function ChannelPage() {
  const { channelId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  const { assets } = useBranding();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [subscribers, setSubscribers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

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

    const { data: postRows, error: postError } = await supabase
      .from("channel_posts")
      .select("*")
      .eq("channel_id", channelId)
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("pinned", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(60);
    if (postError) setError(postError.message);
    setPosts((postRows ?? []) as Post[]);

    const visibleIds = (postRows ?? []).map((row) => (row as Post).id);
    if (visibleIds.length > 0) {
      const { error: viewError } = await supabase.rpc(
        "pingo_record_channel_views",
        { post_ids: visibleIds },
      );
      if (viewError && !/function|schema cache/i.test(viewError.message)) {
        console.warn("[PINGO] channel views:", viewError.message);
      }
    }

    const { count } = await supabase
      .from("channel_members")
      .select("user_id", { count: "exact", head: true })
      .eq("channel_id", channelId);
    setSubscribers(count ?? 0);

    if (profile) {
      const { data: membership } = await supabase
        .from("channel_members")
        .select("user_id,role,muted")
        .eq("channel_id", channelId)
        .eq("user_id", profile.id)
        .maybeSingle();
      setFollowing(Boolean(membership));
      setMuted(Boolean((membership as { muted?: boolean } | null)?.muted));
      setMyRole(membership?.role ?? null);
    }
    setLoading(false);
  }, [channelId, profile]);

  useEffect(() => {
    const invite = searchParams.get("invite");
    if (!invite || !profile) {
      void Promise.resolve().then(() => load());
      return;
    }
    let active = true;
    void (async () => {
      const { error: joinError } = await supabase.rpc(
        "pingo_join_channel_by_invite",
        { code: invite },
      );
      if (!active) return;
      setSearchParams({}, { replace: true });
      if (joinError) {
        setInviteError(
          /not found|invalid/i.test(joinError.message)
            ? "This invite link is invalid or has expired."
            : joinError.message,
        );
        setLoading(false);
        return;
      }
      setInviteError(null);
      await load();
    })();
    return () => {
      active = false;
    };
    // The invite is consumed once; load/profile changes must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, profile?.id]);

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`channel-feed:${channelId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "channel_posts",
          filter: `channel_id=eq.${channelId}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, load]);

  async function toggleFollow() {
    if (!profile || !channel || busy) return;
    if (channel.owner_id === profile.id) return;
    setBusy(true);
    setError(null);
    if (following) {
      const { error: leaveError } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", profile.id);
      if (leaveError) setError(leaveError.message);
      else {
        setFollowing(false);
        setSubscribers((current) => Math.max(0, current - 1));
      }
    } else {
      const { error: insertError } = await supabase
        .from("channel_members")
        .upsert(
          { channel_id: channel.id, user_id: profile.id, role: "member" },
          { onConflict: "channel_id,user_id" },
        );
      if (insertError) setError(insertError.message);
      else {
        setFollowing(true);
        setSubscribers((current) => current + 1);
      }
    }
    setBusy(false);
  }

  async function toggleMute() {
    if (!profile || !channel) return;
    const next = !muted;
    const { error: muteError } = await supabase
      .from("channel_members")
      .update({ muted: next })
      .eq("channel_id", channel.id)
      .eq("user_id", profile.id);
    if (muteError) setError(muteError.message);
    else setMuted(next);
  }

  async function share() {
    if (!channel) return;
    const base = `${window.location.origin}/app/channels/${channel.id}`;
    const url =
      !channel.is_public && channel.invite_code
        ? `${base}?invite=${channel.invite_code}`
        : base;
    try {
      if (navigator.share) {
        await navigator.share({ title: channel.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setError("Channel link copied.");
    } catch {
      // Share sheet dismissed.
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
        <p className="text-sm font-medium">
          {inviteError ? "Invite not accepted" : "Channel unavailable"}
        </p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
          {inviteError ?? "It may be private or no longer exist."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/app/channels")}>
          Browse channels
        </Button>
      </div>
    );
  }

  const isOwner = profile?.id === channel.owner_id;
  const canManage =
    isOwner || myRole === "owner" || myRole === "admin";
  const pinned = posts.find((post) => post.pinned) ?? null;
  const avatar = channel.avatar_url ?? assets.default_channel_url ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/95 px-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/app/channels")}
          aria-label="Back to channels"
        >
          <ArrowLeft className="size-5" />
        </Button>
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="size-9 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-primary">
            <Hash className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            {channel.name}
            <VerifiedBadge verified={channel.is_verified} label="Verified channel" />
          </p>
          <p className="truncate text-[0.65rem] text-muted-foreground">
            {subscribers.toLocaleString()} subscriber
            {subscribers === 1 ? "" : "s"}
            {!channel.is_public && (
              <span className="ml-1.5 inline-flex items-center gap-0.5">
                <Lock className="size-2.5" /> Private
              </span>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setInfoOpen(true)}
          aria-label="Channel information"
        >
          <Info className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMoreOpen(true)}
          aria-label="More channel options"
        >
          <MoreVertical className="size-5" />
        </Button>
      </header>

      <div className="border-b border-border bg-card px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {avatar ? (
            <img
              src={avatar}
              alt={channel.name}
              className="size-16 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Hash className="size-7" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 truncate text-lg leading-tight font-semibold tracking-[-0.02em]">
              {channel.name}
              <VerifiedBadge verified={channel.is_verified} label="Verified channel" />
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              @{channel.username}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
              <span className="flex items-center gap-1">
                <UsersRound className="size-3" />
                {subscribers.toLocaleString()} subscriber
                {subscribers === 1 ? "" : "s"}
              </span>
              <span>{channel.is_public ? "Public" : "Private"}</span>
            </p>
          </div>
        </div>

        {channel.description && (
          <p className="mt-2.5 line-clamp-3 text-xs leading-5 text-muted-foreground">
            {channel.description}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {canManage ? (
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
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : following ? (
                <Check className="size-4" />
              ) : (
                <Bell className="size-4" />
              )}
              {following ? "Subscribed" : "Subscribe"}
            </Button>
          )}
          {following && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => void toggleMute()}
              aria-label={muted ? "Unmute channel" : "Mute channel"}
              title={muted ? "Notifications off" : "Notifications on"}
            >
              {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => void share()}
            aria-label="Share channel"
          >
            <Share2 className="size-4" />
          </Button>
        </div>

        {error && (
          <p className="mt-2 rounded-md bg-secondary px-3 py-2 text-[0.68rem] text-muted-foreground">
            {error}
          </p>
        )}
      </div>

      {pinned && <PinnedPanel post={pinned} />}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
            {avatar ? (
              <img src={avatar} alt="" className="size-full rounded-full object-cover" />
            ) : (
              <Hash className="size-6" />
            )}
          </span>
          <p className="mt-3 text-sm font-semibold">No posts yet</p>
          <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
            {canManage
              ? "This channel is ready. Publish its first post to give subscribers something to read."
              : "New posts from this channel will appear here. You can keep it subscribed and notifications on."}
          </p>
          {canManage && (
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => navigate(`/app/channels/${channel.id}/compose`)}
            >
              <PenSquare className="size-3.5" /> Create first post
            </Button>
          )}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl">
          {posts.map((post) => (
            <ChannelPostCard
              key={post.id}
              post={post}
              channelId={channel.id}
              commentsEnabled={Boolean(channel.comments_enabled)}
              canManage={canManage}
              currentProfile={profile}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Channel options</DialogTitle>
          <div className="space-y-1">
            <ActionRow
              icon={<Info className="size-4" />}
              label="Channel information"
              onClick={() => {
                setMoreOpen(false);
                setInfoOpen(true);
              }}
            />
            <ActionRow
              icon={<Link2 className="size-4" />}
              label="Copy invite link"
              onClick={() => {
                setMoreOpen(false);
                void share();
              }}
            />
            {canManage && (
              <>
                <ActionRow
                  icon={<UsersRound className="size-4" />}
                  label="Subscribers"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(`/app/channels/${channel.id}/subscribers`);
                  }}
                />
                <ActionRow
                  icon={<Check className="size-4" />}
                  label="Administrators"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(`/app/channels/${channel.id}/admins`);
                  }}
                />
                <ActionRow
                  icon={<PenSquare className="size-4" />}
                  label="Create post"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(`/app/channels/${channel.id}/compose`);
                  }}
                />
              </>
            )}
            {following && (
              <ActionRow
                icon={muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                label={muted ? "Turn notifications on" : "Turn notifications off"}
                onClick={() => {
                  setMoreOpen(false);
                  void toggleMute();
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="sr-only">Channel information</DialogTitle>
          <div className="flex flex-col items-center text-center">
            {avatar ? (
              <img
                src={avatar}
                alt={channel.name}
                className="size-20 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-full bg-secondary text-primary">
                <Hash className="size-8" />
              </span>
            )}
            <p className="mt-3 text-base font-semibold">{channel.name}</p>
            <p className="text-xs text-muted-foreground">@{channel.username}</p>
            <p className="mt-1 text-[0.68rem] text-muted-foreground">
              {subscribers.toLocaleString()} subscribers ·{" "}
              {channel.is_public ? "Public" : "Private"} ·{" "}
              {posts.length} post{posts.length === 1 ? "" : "s"}
            </p>
          </div>
          {channel.description && (
            <p className="text-xs leading-5 text-muted-foreground">{channel.description}</p>
          )}
          <div className={cn("grid gap-2", canManage ? "grid-cols-2" : "grid-cols-1")}>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setInfoOpen(false);
                navigate(`/app/channels/${channel.id}/info`);
              }}
            >
              <Info className="size-4" /> Full profile
            </Button>
            {canManage && (
              <Button
                className="gap-1.5"
                onClick={() => {
                  setInfoOpen(false);
                  navigate(`/app/channels/${channel.id}/compose`);
                }}
              >
                <PenSquare className="size-4" /> Post
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PinnedPanel({ post }: { post: Post }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const firstPath = postMediaPaths(post)[0] ?? null;

  useEffect(() => {
    if (!firstPath) return;
    let active = true;
    void supabase.storage
      .from("channel-media")
      .createSignedUrl(firstPath, 3600)
      .then(({ data }) => {
        if (active && data?.signedUrl) setThumb(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [firstPath]);

  const isImage = firstPath ? /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(firstPath) : false;

  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById(`post-${post.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="flex w-full items-start gap-2.5 border-b border-border bg-accent/40 px-4 py-2.5 text-left"
    >
      <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-primary">
          Pinned post
        </span>
        <span className="mt-0.5 block truncate text-xs text-foreground/90">
          {post.body?.trim() ||
            (firstPath ? (isImage ? "Photo" : "Video or attachment") : "Channel post")}
        </span>
      </span>
      {thumb && isImage && (
        <img
          src={thumb}
          alt=""
          className="size-9 shrink-0 rounded-md object-cover"
        />
      )}
      {firstPath && !isImage && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Hash className="size-4" />
        </span>
      )}
    </button>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm hover:bg-secondary"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}
