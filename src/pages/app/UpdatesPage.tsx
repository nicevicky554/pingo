import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { sendMessage, startDirectConversation } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import { watchChannel } from "@/lib/realtime";
import type { Profile, StatusUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Eye,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Radio,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "👍"];

type StatusGroup = {
  profile: Profile;
  statuses: StatusUpdate[];
  allSeen: boolean;
};

type ViewerRow = {
  viewer_id: string;
  viewed_at: string;
  profile: Profile | null;
};

function useSignedStatus(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void supabase.storage
      .from("status-media")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}

function StatusVisual({
  status,
  paused,
  onEnded,
}: {
  status: StatusUpdate;
  paused: boolean;
  onEnded: () => void;
}) {
  const url = useSignedStatus(status.media_path);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (paused) video.pause();
    else void video.play().catch(() => undefined);
  }, [paused]);

  if (status.kind === "text" || !status.media_path) {
    return (
      <div
        className="flex size-full items-center justify-center px-8 py-16 text-center"
        style={{ backgroundColor: status.background ?? "#0F5F63" }}
      >
        <p className="max-w-lg text-[1.6rem] leading-snug font-semibold text-white whitespace-pre-wrap">
          {status.body}
        </p>
      </div>
    );
  }

  const rotation = status.rotation ?? 0;

  if (status.kind === "video") {
    return url ? (
      <video
        ref={videoRef}
        src={url}
        autoPlay
        playsInline
        onEnded={onEnded}
        className="size-full object-contain"
        style={{ transform: `rotate(${rotation}deg)` }}
      />
    ) : (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white" />
      </div>
    );
  }

  return url ? (
    <img
      src={url}
      alt={status.caption ?? "Status"}
      className="size-full object-contain"
      style={{ transform: `rotate(${rotation}deg)` }}
    />
  ) : (
    <div className="flex size-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-white" />
    </div>
  );
}

export default function UpdatesPage() {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewerGroup, setViewerGroup] = useState<StatusGroup | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const load = useCallback(async () => {
    if (!profileId) return;
    const { data: rows } = await supabase
      .from("status_updates")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });
    const list = (rows ?? []) as StatusUpdate[];
    setStatuses(list);

    const userIds = Array.from(new Set(list.map((item) => item.user_id)));
    if (userIds.length > 0) {
      const { data: people } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", userIds);
      setProfiles(
        Object.fromEntries(
          ((people ?? []) as Profile[]).map((item) => [item.id, item]),
        ),
      );
    }

    const { data: views } = await supabase
      .from("status_views")
      .select("status_id")
      .eq("viewer_id", profileId);
    setViewed(new Set((views ?? []).map((row) => row.status_id)));
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profileId) return;
    const channel = watchChannel("status-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_updates" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profileId]);

  const mine = useMemo(
    () => statuses.filter((status) => status.user_id === profile?.id),
    [statuses, profile?.id],
  );

  const groups = useMemo<StatusGroup[]>(() => {
    const byUser = new Map<string, StatusUpdate[]>();
    for (const status of statuses) {
      if (status.user_id === profile?.id) continue;
      byUser.set(status.user_id, [
        ...(byUser.get(status.user_id) ?? []),
        status,
      ]);
    }
    return Array.from(byUser.entries())
      .filter(([userId]) => profiles[userId])
      .map(([userId, items]) => ({
        profile: profiles[userId],
        statuses: items,
        allSeen: items.every((item) => viewed.has(item.id)),
      }))
      .sort((a, b) => {
        if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
        const aTime = a.statuses[a.statuses.length - 1].created_at;
        const bTime = b.statuses[b.statuses.length - 1].created_at;
        return bTime.localeCompare(aTime);
      });
  }, [statuses, profile?.id, profiles, viewed]);

  useEffect(() => {
    const requested = searchParams.get("statusUser");
    if (!requested || !profile) return;
    const target =
      requested === profile.id
        ? mine.length > 0
          ? { profile, statuses: mine, allSeen: true }
          : null
        : (groups.find((group) => group.profile.id === requested) ?? null);
    if (target) {
      setViewerGroup(target);
      setViewerIndex(0);
      setSearchParams({}, { replace: true });
    } else if (!loading) {
      setSearchParams({}, { replace: true });
    }
  }, [groups, loading, mine, profile, searchParams, setSearchParams]);

  async function recordView(status: StatusUpdate) {
    if (!profile || status.user_id === profile.id || viewed.has(status.id)) return;
    setViewed((current) => new Set(current).add(status.id));
    await supabase.from("status_views").upsert(
      { status_id: status.id, viewer_id: profile.id },
      { onConflict: "status_id,viewer_id", ignoreDuplicates: true },
    );
  }

  async function deleteStatus(status: StatusUpdate) {
    if (!window.confirm("Delete this status?")) return;
    if (status.media_path) {
      await supabase.storage.from("status-media").remove([status.media_path]);
    }
    await supabase
      .from("status_updates")
      .delete()
      .eq("id", status.id)
      .eq("user_id", profile?.id ?? "");
    setViewerGroup(null);
    void load();
  }

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b border-border bg-card px-3 py-2 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.05rem] font-semibold tracking-[-0.01em]">
            Updates
          </h1>
          <p className="truncate text-[0.68rem] text-muted-foreground">
            Status updates · 24 hours
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-9 shrink-0 text-muted-foreground"
          asChild
          aria-label="Status privacy"
        >
          <Link to="/app/settings/privacy">
            <Lock className="size-[18px]" />
          </Link>
        </Button>
        <Button
          size="icon"
          className="size-9 shrink-0"
          onClick={() => navigate("/app/updates/create")}
          aria-label="Add status"
        >
          <Plus className="size-[19px]" />
        </Button>
      </header>

      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={() => {
            if (mine.length > 0) {
              setViewerGroup({ profile, statuses: mine, allSeen: true });
              setViewerIndex(0);
            } else {
              navigate("/app/updates/create");
            }
          }}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60"
        >
          <span className="relative shrink-0">
            <UserAvatar
              profile={profile}
              size="lg"
              ring={mine.length > 0 ? "own" : null}
            />
            {mine.length === 0 ? (
              <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                <Plus className="size-3" />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.92rem] font-semibold">
              My status
            </span>
            <span className="mt-0.5 block truncate text-[0.75rem] text-muted-foreground">
              {mine.length > 0
                ? `${mine.length} update${mine.length > 1 ? "s" : ""} · ${new Date(
                    mine[mine.length - 1].created_at,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : "Tap to add a text, photo or video status"}
            </span>
          </span>
          {mine.length > 0 ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.62rem] font-semibold text-primary">
              {mine.length}
            </span>
          ) : null}
        </button>

        <div className="mt-1 border-y border-border bg-card">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h2 className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Recent updates
            </h2>
            {groups.some((group) => !group.allSeen) && (
              <span className="text-[0.62rem] font-medium text-primary">
                {groups.filter((group) => !group.allSeen).length} new
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">No recent updates</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                Status updates from people you're connected to appear here for
                24 hours.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => navigate("/app/updates/create")}
              >
                <Plus className="size-3.5" /> Add a status
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {groups.map((group) => {
                const latest = group.statuses[group.statuses.length - 1];
                return (
                  <li key={group.profile.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setViewerGroup(group);
                        setViewerIndex(0);
                        void recordView(group.statuses[0]);
                      }}
                      className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors hover:bg-secondary/60"
                    >
                      <UserAvatar
                        profile={group.profile}
                        size="md"
                        ring={group.allSeen ? "viewed" : "unseen"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9rem] font-medium">
                          {group.profile.display_name ||
                            group.profile.username}
                        </span>
                        <span className="mt-0.5 block text-[0.72rem] text-muted-foreground">
                          {new Date(latest.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {group.statuses.length > 1
                            ? ` · ${group.statuses.length} updates`
                            : " · 1 update"}
                        </span>
                      </span>
                      {!group.allSeen && (
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Link
          to="/app/channels"
          className="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-secondary/60"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <Radio className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.88rem] font-medium">
              Discover channels
            </span>
            <span className="block text-[0.72rem] text-muted-foreground">
              Broadcast feeds you can follow
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </div>

      {viewerGroup && (
        <StatusViewer
          group={viewerGroup}
          index={viewerIndex}
          currentUserId={profile.id}
          onIndexChange={(next) => {
            setViewerIndex(next);
            void recordView(viewerGroup.statuses[next]);
          }}
          onClose={() => setViewerGroup(null)}
          onOpenProfile={(userId) => {
            setViewerGroup(null);
            navigate(`/app/profile/${userId}`);
          }}
          isMine={viewerGroup.profile.id === profile.id}
          onDelete={() => void deleteStatus(viewerGroup.statuses[viewerIndex])}
          onReply={async (message) => {
            const conversationId = await startDirectConversation(
              viewerGroup.profile.id,
            );
            // Uses the same insert + verified server fallback as every other
            // message, so a status reply cannot silently fail on RLS.
            await sendMessage({
              conversationId,
              senderId: profile.id,
              body: message,
              statusReplyTo: viewerGroup.statuses[viewerIndex].id,
            });
            setViewerGroup(null);
          }}
        />
      )}
    </div>
  );
}

function StatusViewer({
  group,
  index,
  currentUserId,
  onIndexChange,
  onClose,
  onOpenProfile,
  isMine,
  onDelete,
  onReply,
}: {
  group: StatusGroup;
  index: number;
  currentUserId: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  isMine: boolean;
  onDelete: () => void;
  onReply: (message: string) => Promise<void>;
}) {
  const status = group.statuses[index];
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersLoading, setViewersLoading] = useState(false);
  const touchStart = useRef<number | null>(null);

  const advance = useCallback(() => {
    if (index < group.statuses.length - 1) onIndexChange(index + 1);
    else onClose();
  }, [group.statuses.length, index, onClose, onIndexChange]);

  useEffect(() => {
    setPaused(false);
    setViewersOpen(false);
  }, [status.id]);

  useEffect(() => {
    if (paused) return;
    if (status.kind === "video" && status.media_path) return;
    const timer = window.setTimeout(advance, 6000);
    return () => window.clearTimeout(timer);
  }, [index, paused, status.id, status.kind, status.media_path, advance]);

  useEffect(() => {
    if (!isMine) return;
    let active = true;
    setViewersLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("status_views")
        .select("viewer_id,viewed_at")
        .eq("status_id", status.id)
        .order("viewed_at", { ascending: false });
      const rows = data ?? [];
      const ids = rows.map((row) => row.viewer_id);
      let people: Profile[] = [];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("public_profiles")
          .select("*")
          .in("id", ids);
        people = (profiles ?? []) as Profile[];
      }
      const byId = new Map(people.map((person) => [person.id, person]));
      if (active) {
        setViewers(
          rows.map((row) => ({
            viewer_id: row.viewer_id,
            viewed_at: row.viewed_at,
            profile: byId.get(row.viewer_id) ?? null,
          })),
        );
        setViewersLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isMine, status.id]);

  async function react(emoji: string) {
    if (reaction === emoji) {
      setReaction(null);
      await supabase
        .from("status_reactions")
        .delete()
        .match({ status_id: status.id, user_id: currentUserId });
      return;
    }
    setReaction(emoji);
    // Delete-then-insert avoids requiring SELECT on other viewers' reactions
    // (the read policy is owner-only).
    await supabase
      .from("status_reactions")
      .delete()
      .match({ status_id: status.id, user_id: currentUserId });
    await supabase.from("status_reactions").insert({
      status_id: status.id,
      user_id: currentUserId,
      emoji,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0A141B]"
      onTouchStart={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,button")) {
          touchStart.current = null;
          return;
        }
        touchStart.current = event.touches[0].clientY;
      }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return;
        const delta = event.changedTouches[0].clientY - touchStart.current;
        touchStart.current = null;
        if (delta > 90) onClose();
      }}
    >
      <div className="flex gap-1 px-3 pt-3">
        {group.statuses.map((item, position) => (
          <span
            key={item.id}
            className={cn(
              "h-[3px] flex-1 overflow-hidden rounded-full bg-white/25",
              position < index && "bg-white",
            )}
          >
            {position === index && (
              <span
                className="block h-full w-full origin-left animate-[status-progress_6s_linear_forwards] bg-white"
                style={{ animationPlayState: paused ? "paused" : "running" }}
              />
            )}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onOpenProfile(group.profile.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <UserAvatar profile={group.profile} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-[0.84rem] font-semibold text-white">
              {group.profile.display_name || group.profile.username}
            </span>
            <span className="block text-[0.64rem] text-white/60">
              {new Date(status.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
        </button>
        {isMine && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => setViewersOpen((open) => !open)}
            >
              <Eye className="size-4" /> {viewers.length}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              aria-label="Delete status"
              className="size-8 text-white hover:bg-white/10"
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close status viewer"
          className="size-8 text-white hover:bg-white/10"
        >
          <X className="size-5" />
        </Button>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          if (ratio < 0.3 && index > 0) onIndexChange(index - 1);
          else if (ratio > 0.7) advance();
          else setPaused((value) => !value);
        }}
      >
        <StatusVisual status={status} paused={paused} onEnded={advance} />

        {index > 0 && (
          <button
            type="button"
            aria-label="Previous status"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange(index - 1);
            }}
            className="absolute top-1/2 left-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/90"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Next status"
          onClick={(event) => {
            event.stopPropagation();
            advance();
          }}
          className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white/90"
        >
          <ArrowRight className="size-5" />
        </button>

        {paused && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/15">
            <span className="flex size-14 items-center justify-center rounded-full bg-black/45 text-white">
              ▶
            </span>
          </span>
        )}

        {status.caption && status.media_path && (
          <p className="absolute inset-x-4 bottom-3 rounded-xl bg-black/55 px-4 py-2 text-center text-sm leading-6 text-white backdrop-blur">
            {status.caption}
          </p>
        )}

        {isMine && viewersOpen && (
          <div
            className="absolute inset-x-0 bottom-0 max-h-64 overflow-y-auto rounded-t-2xl bg-[#101820]/95 px-4 pt-3 pb-4 backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <p className="text-sm font-semibold text-white">
                Viewed by {viewers.length}
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setViewersOpen(false);
                }}
                className="text-white/60 hover:text-white"
                aria-label="Close viewers"
              >
                <X className="size-4" />
              </button>
            </div>
            {viewersLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-white/70" />
              </div>
            ) : viewers.length === 0 ? (
              <p className="py-6 text-center text-xs text-white/60">
                No views yet.
              </p>
            ) : (
              <ul className="divide-y divide-white/10">
                {viewers.map((row) => (
                  <li
                    key={row.viewer_id}
                    className="flex items-center gap-2.5 py-2"
                  >
                    <UserAvatar profile={row.profile} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[0.82rem] text-white">
                      {row.profile?.display_name ||
                        row.profile?.username ||
                        "PINGO user"}
                    </span>
                    <span className="shrink-0 text-[0.62rem] text-white/50">
                      {new Date(row.viewed_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {isMine ? (
        <div className="px-4 py-3 text-center text-[0.68rem] text-white/55">
          Only you can see who viewed this status.
        </div>
      ) : (
        <div className="px-3 pt-2 pb-3">
          <div className="mb-2 flex items-center justify-center gap-2">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => void react(emoji)}
                aria-label={`React ${emoji}`}
                className={cn(
                  "flex size-9 items-center justify-center rounded-full text-lg transition-transform",
                  reaction === emoji
                    ? "scale-110 bg-white/25"
                    : "bg-white/10 hover:bg-white/20",
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply privately…"
              className="h-10 border-white/20 bg-white/10 text-white placeholder:text-white/50"
              onKeyDown={(event) => {
                if (event.key === "Enter" && reply.trim() && !sending) {
                  event.preventDefault();
                  setSending(true);
                  void onReply(reply.trim())
                    .then(() => setReply(""))
                    .finally(() => setSending(false));
                }
              }}
            />
            <Button
              size="icon"
              aria-label="Send status reply"
              disabled={!reply.trim() || sending}
              onClick={async () => {
                if (!reply.trim()) return;
                setSending(true);
                try {
                  await onReply(reply.trim());
                  setReply("");
                } finally {
                  setSending(false);
                }
              }}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageCircle className="size-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
