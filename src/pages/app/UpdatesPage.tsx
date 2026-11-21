import { UserAvatar } from "@/components/UserAvatar";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { startDirectConversation } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { Channel, Profile, StatusUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Eye,
  ImagePlus,
  Loader2,
  MessageCircle,
  Plus,
  Radio,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BACKGROUNDS = [
  "#126B78",
  "#1F8A7A",
  "#2C5F8A",
  "#6B4A72",
  "#87503F",
  "#2F6B4F",
  "#26313A",
];

type StatusGroup = {
  profile: Profile;
  statuses: StatusUpdate[];
  allSeen: boolean;
};

function useSignedStatus(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) return;
    supabase.storage
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

function StatusVisual({ status }: { status: StatusUpdate }) {
  const url = useSignedStatus(status.media_path);
  if (status.kind === "text" || !status.media_path) {
    return (
      <div
        className="flex size-full items-center justify-center p-10 text-center"
        style={{ backgroundColor: status.background ?? "#126B78" }}
      >
        <p className="max-w-lg text-2xl leading-snug font-bold text-white whitespace-pre-wrap">
          {status.body}
        </p>
      </div>
    );
  }
  if (status.kind === "video") {
    return url ? (
      <video src={url} controls autoPlay className="size-full object-contain" />
    ) : (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-white" />
      </div>
    );
  }
  return url ? (
    <img src={url} alt={status.caption ?? "Status"} className="size-full object-contain" />
  ) : (
    <div className="flex size-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-white" />
    </div>
  );
}

export default function UpdatesPage() {
  const { profile } = useAuth();
  const [statuses, setStatuses] = useState<StatusUpdate[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewerGroup, setViewerGroup] = useState<StatusGroup | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [channelOpen, setChannelOpen] = useState<Channel | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
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
        Object.fromEntries(((people ?? []) as Profile[]).map((item) => [item.id, item])),
      );
    }

    const { data: views } = await supabase
      .from("status_views")
      .select("status_id,viewer_id")
      .eq("viewer_id", profile.id);
    setViewed(new Set((views ?? []).map((row) => row.status_id)));

    const { data: publicChannels } = await supabase
      .from("channels")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(12);
    setChannels((publicChannels ?? []) as Channel[]);

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

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("status-watch")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "status_updates" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profile]);

  const mine = useMemo(
    () => statuses.filter((status) => status.user_id === profile?.id),
    [statuses, profile?.id],
  );

  const groups = useMemo<StatusGroup[]>(() => {
    const byUser = new Map<string, StatusUpdate[]>();
    for (const status of statuses) {
      if (status.user_id === profile?.id) continue;
      byUser.set(status.user_id, [...(byUser.get(status.user_id) ?? []), status]);
    }
    return Array.from(byUser.entries())
      .filter(([userId]) => profiles[userId])
      .map(([userId, items]) => ({
        profile: profiles[userId],
        statuses: items,
        allSeen: items.every((item) => viewed.has(item.id)),
      }))
      .sort((a, b) => Number(a.allSeen) - Number(b.allSeen));
  }, [statuses, profile?.id, profiles, viewed]);

  async function recordView(status: StatusUpdate) {
    if (!profile || viewed.has(status.id)) return;
    setViewed((current) => new Set(current).add(status.id));
    await supabase
      .from("status_views")
      .insert({ status_id: status.id, viewer_id: profile.id });
  }

  async function deleteStatus(status: StatusUpdate) {
    if (!window.confirm("Delete this status?")) return;
    await supabase
      .from("status_updates")
      .delete()
      .eq("id", status.id)
      .eq("user_id", profile?.id ?? "");
    setViewerGroup(null);
    void load();
  }

  async function toggleFollow(channel: Channel) {
    if (!profile) return;
    const isFollowing = followed.has(channel.id);
    if (isFollowing) {
      await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", profile.id);
      setFollowed((current) => {
        const next = new Set(current);
        next.delete(channel.id);
        return next;
      });
    } else {
      const { error } = await supabase
        .from("channel_members")
        .insert({ channel_id: channel.id, user_id: profile.id });
      if (!error) setFollowed((current) => new Set(current).add(channel.id));
    }
  }

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-background">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Radio className="size-5" />
        </span>
        <div>
          <h1 className="text-base font-extrabold">Updates</h1>
          <p className="text-[0.68rem] text-muted-foreground">
            Statuses and channels, live for 24 hours
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" /> Add status
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {/* My status */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            My status
          </h2>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <button
              type="button"
              onClick={() => {
                if (mine.length > 0) {
                  setViewerGroup({
                    profile: { ...profile },
                    statuses: mine,
                    allSeen: true,
                  });
                  setViewerIndex(0);
                  void recordView(mine[0]);
                } else {
                  setCreateOpen(true);
                }
              }}
              className="relative"
              aria-label={mine.length ? "View my status" : "Add a status"}
            >
              <UserAvatar profile={profile} size="lg" ring={mine.length ? "own" : null} />
              {mine.length === 0 ? (
                <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                  <Plus className="size-3" />
                </span>
              ) : (
                <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-[0.6rem] font-bold text-primary-foreground">
                  {mine.length}
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">My status</p>
              <p className="text-xs text-muted-foreground">
                {mine.length > 0
                  ? `${mine.length} update${mine.length > 1 ? "s" : ""} · tap to preview`
                  : "Share a text or photo update"}
              </p>
            </div>
            {mine.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => void deleteStatus(mine[mine.length - 1])}
              >
                <Trash2 className="size-4" /> Delete latest
              </Button>
            )}
          </div>
        </section>

        {/* Recent updates */}
        <section className="mt-8">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Recent updates
          </h2>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
              <p className="text-sm font-semibold">No updates yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Statuses from people you're connected to will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {groups.map((group) => (
                <button
                  key={group.profile.id}
                  type="button"
                  onClick={() => {
                    setViewerGroup(group);
                    setViewerIndex(0);
                    void recordView(group.statuses[0]);
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40"
                >
                  <UserAvatar
                    profile={group.profile}
                    size="lg"
                    ring={group.allSeen ? "viewed" : "unseen"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">
                      {group.profile.display_name || group.profile.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {group.statuses.length} update
                      {group.statuses.length > 1 ? "s" : ""} ·{" "}
                      {new Date(
                        group.statuses[group.statuses.length - 1].created_at,
                      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {group.allSeen && <Check className="size-4 text-muted-foreground" />}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Channels */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Channels to follow
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateChannelOpen(true)}
              className="gap-1.5"
            >
              <Plus className="size-4" /> Create
            </Button>
          </div>

          {channelError && (
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {channelError}
            </p>
          )}

          {channels.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-8 text-center">
              <p className="text-sm font-semibold">No public channels yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create the first one and invite people to follow it.
              </p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {channels.map((channel) => (
                <div key={channel.id} className="flex items-center gap-3 p-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Radio className="size-5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setChannelOpen(channel);
                      setChannelError(null);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-bold">{channel.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{channel.username}
                      {channel.description ? ` · ${channel.description}` : ""}
                    </p>
                  </button>
                  <Button
                    size="sm"
                    variant={followed.has(channel.id) ? "ghost" : "outline"}
                    onClick={() => void toggleFollow(channel)}
                  >
                    {followed.has(channel.id) ? (
                      <>
                        <Check className="size-3.5" /> Following
                      </>
                    ) : (
                      "Follow"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreateStatusDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={profile.id}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />

      {viewerGroup && (
        <StatusViewer
          group={viewerGroup}
          index={viewerIndex}
          onIndexChange={(next) => {
            setViewerIndex(next);
            void recordView(viewerGroup.statuses[next]);
          }}
          onClose={() => setViewerGroup(null)}
          isMine={viewerGroup.profile.id === profile.id}
          onDelete={() => void deleteStatus(viewerGroup.statuses[viewerIndex])}
          onReply={async (message) => {
            const conversationId = await startDirectConversation(
              viewerGroup.profile.id,
            );
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender_id: profile.id,
              body: message,
            });
            setViewerGroup(null);
          }}
        />
      )}

      {channelOpen && (
        <ChannelSheet
          channel={channelOpen}
          currentUserId={profile.id}
          following={followed.has(channelOpen.id)}
          onToggleFollow={() => void toggleFollow(channelOpen)}
          onClose={() => setChannelOpen(null)}
        />
      )}

      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        userId={profile.id}
        onCreated={(error) => {
          if (error) {
            setChannelError(error);
            return;
          }
          setCreateChannelOpen(false);
          void load();
        }}
      />
    </div>
  );
}

function CreateStatusDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}) {
  const [text, setText] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText("");
      setFile(null);
      setPreviewUrl(null);
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!text.trim() && !file) {
      setError("Add a caption or a photo first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let mediaPath: string | null = null;
      let kind: "text" | "image" | "video" = "text";
      if (file) {
        kind = file.type.startsWith("video/") ? "video" : "image";
        const extension = file.name.split(".").pop() ?? "jpg";
        mediaPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("status-media")
          .upload(mediaPath, file, { contentType: file.type });
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase
        .from("status_updates")
        .insert({
          user_id: userId,
          kind,
          body: text.trim() || null,
          media_path: mediaPath,
          background,
          caption: text.trim() || null,
        });
      if (insertError) throw insertError;
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status could not be posted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a status</DialogTitle>
          <DialogDescription>
            It disappears automatically after 24 hours.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex min-h-44 items-center justify-center overflow-hidden rounded-xl p-6"
          style={{ backgroundColor: file ? "#101C25" : background }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Status preview"
              className="max-h-64 rounded-lg object-contain"
            />
          ) : (
            <Textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write something worth sharing…"
              maxLength={280}
              className="min-h-24 resize-none border-0 bg-transparent text-center text-lg font-bold text-white placeholder:text-white/60 focus-visible:ring-0"
            />
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (!next) return;
            if (next.size > 25 * 1024 * 1024) {
              setError("Status media must be smaller than 25 MB.");
              return;
            }
            setFile(next);
            setPreviewUrl(URL.createObjectURL(next));
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            <ImagePlus className="size-4" /> Photo or video
          </Button>
          {!file &&
            BACKGROUNDS.map((colour) => (
              <button
                key={colour}
                type="button"
                onClick={() => setBackground(colour)}
                aria-label={`Use background ${colour}`}
                className={cn(
                  "size-6 rounded-full border-2",
                  background === colour ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: colour }}
              />
            ))}
        </div>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Post status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusViewer({
  group,
  index,
  onIndexChange,
  onClose,
  isMine,
  onDelete,
  onReply,
}: {
  group: StatusGroup;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  isMine: boolean;
  onDelete: () => void;
  onReply: (message: string) => Promise<void>;
}) {
  const status = group.statuses[index];
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => {
      if (index < group.statuses.length - 1) onIndexChange(index + 1);
      else onClose();
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [index, group.statuses.length, onIndexChange, onClose, paused]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A141B]">
      <div className="flex gap-1 px-3 pt-3">
        {group.statuses.map((item, position) => (
          <span
            key={item.id}
            className={cn(
              "h-[3px] flex-1 rounded-full",
              position <= index ? "bg-white" : "bg-white/25",
            )}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        <UserAvatar profile={group.profile} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {group.profile.display_name || group.profile.username}
          </p>
          <p className="text-[0.68rem] text-white/60">
            {new Date(status.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        {isMine && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete status"
            className="text-white hover:bg-white/10"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close status viewer"
          className="text-white hover:bg-white/10"
        >
          <X className="size-5" />
        </Button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={() => setPaused((value) => !value)}
      >
        <StatusVisual status={status} />

        {index > 0 && (
          <button
            type="button"
            aria-label="Previous status"
            onClick={(event) => {
              event.stopPropagation();
              onIndexChange(index - 1);
            }}
            className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        {(index < group.statuses.length - 1 || !isMine) && (
          <button
            type="button"
            aria-label="Next status"
            onClick={(event) => {
              event.stopPropagation();
              if (index < group.statuses.length - 1) onIndexChange(index + 1);
              else onClose();
            }}
            className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <ArrowRight className="size-5" />
          </button>
        )}

        {status.caption && status.media_path && (
          <p className="absolute inset-x-8 bottom-4 rounded-lg bg-black/50 px-4 py-2 text-center text-sm text-white backdrop-blur">
            {status.caption}
          </p>
        )}
      </div>

      {isMine ? (
        <div className="flex items-center justify-center gap-6 px-4 py-4 text-white/80">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Eye className="size-4" /> Viewers are recorded in the database
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-3">
          <Input
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Reply to this status…"
            className="h-10 border-white/20 bg-white/10 text-white placeholder:text-white/50"
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
      )}
    </div>
  );
}

function ChannelSheet({
  channel,
  currentUserId,
  following,
  onToggleFollow,
  onClose,
}: {
  channel: Channel;
  currentUserId: string;
  following: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<
    { id: string; body: string | null; created_at: string; author_id: string; pinned: boolean }[]
  >([]);
  const [draft, setDraft] = useState("");
  const [canPost, setCanPost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("channel_posts")
      .select("id,body,created_at,author_id,pinned")
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setPosts(data ?? []);

    const { data: membership } = await supabase
      .from("channel_members")
      .select("role")
      .eq("channel_id", channel.id)
      .eq("user_id", currentUserId)
      .maybeSingle();
    setCanPost(
      channel.owner_id === currentUserId ||
        membership?.role === "owner" ||
        membership?.role === "admin",
    );
    setLoading(false);
  }, [channel.id, channel.owner_id, currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    if (!draft.trim()) return;
    const { error: insertError } = await supabase.from("channel_posts").insert({
      channel_id: channel.id,
      author_id: currentUserId,
      body: draft.trim(),
    });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDraft("");
    await load();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="size-5 text-primary" /> {channel.name}
          </DialogTitle>
          <DialogDescription>
            @{channel.username}
            {channel.description ? ` · ${channel.description}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant={following ? "ghost" : "outline"} onClick={onToggleFollow}>
            {following ? "Following" : "Follow channel"}
          </Button>
        </div>

        {canPost && (
          <div className="rounded-lg border border-border bg-muted/40 p-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Post to this channel…"
              rows={2}
              maxLength={1000}
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => void publish()} disabled={!draft.trim()}>
                <Send className="size-4" /> Publish
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No posts yet.
            </p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm leading-6 whitespace-pre-wrap">{post.body}</p>
                <p className="mt-2 text-[0.65rem] text-muted-foreground">
                  {new Date(post.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateChannelDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: (error?: string) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setUsername("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (name.trim().length < 2 || !/^[a-z0-9_]{3,32}$/.test(username)) {
      setError("Add a name and a username of 3–32 lowercase characters.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("channels")
      .insert({
        owner_id: userId,
        name: name.trim(),
        username,
        description: description.trim() || null,
        is_public: true,
      })
      .select("id")
      .single();
    if (insertError) {
      const message =
        insertError.code === "23505"
          ? "That channel username is already taken."
          : insertError.message;
      setError(message);
      setSaving(false);
      return;
    }
    const { error: memberError } = await supabase.from("channel_members").insert({
      channel_id: data.id,
      user_id: userId,
      role: "owner",
    });
    setSaving(false);
    if (memberError) {
      setError(memberError.message);
      return;
    }
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>
            A public broadcast feed people can follow.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Channel name"
          maxLength={60}
        />
        <div className="flex items-center rounded-lg border border-input px-3">
          <span className="text-sm text-muted-foreground">@</span>
          <Input
            value={username}
            onChange={(event) =>
              setUsername(
                event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              )
            }
            placeholder="channel_username"
            maxLength={32}
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this channel about?"
          rows={2}
          maxLength={200}
        />
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Radio className="size-4" />}
            Create channel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
