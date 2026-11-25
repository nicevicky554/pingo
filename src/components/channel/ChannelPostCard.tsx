import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Eye,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pin,
  PinOff,
  Send,
  Share2,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChannelPost = {
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

type MediaItem = { path: string; url: string; kind: "image" | "video" | "file" };

const REACTIONS = ["👍", "❤️", "🔥", "🎉", "😮"];

export function postMediaPaths(post: ChannelPost) {
  const paths = [...(post.media_paths ?? [])];
  if (post.media_path && !paths.includes(post.media_path)) {
    paths.unshift(post.media_path);
  }
  return paths;
}

function kindOf(path: string): "image" | "video" | "file" {
  if (/\.(png|jpe?g|gif|webp|avif|heic)$/i.test(path)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(path)) return "video";
  return "file";
}

function linkify(body: string) {
  const pattern = /(https?:\/\/[^\s<]+)/g;
  const parts = body.split(pattern);
  return parts.map((part, index) =>
    pattern.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-primary underline-offset-2 hover:underline"
      >
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function ChannelPostCard({
  post,
  channelId,
  commentsEnabled,
  canManage,
  currentProfile,
  onChanged,
  onOpenCommentsCount,
}: {
  post: ChannelPost;
  channelId: string;
  commentsEnabled: boolean;
  canManage: boolean;
  currentProfile: Profile | null;
  onChanged?: () => void;
  onOpenCommentsCount?: number;
}) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [reactions, setReactions] = useState<
    { emoji: string; count: number; mine: boolean }[]
  >([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<
    { id: string; author_id: string; body: string; created_at: string }[]
  >([]);
  const [commentAuthors, setCommentAuthors] = useState<Record<string, Profile>>(
    {},
  );
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(onOpenCommentsCount ?? 0);
  const [notice, setNotice] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const paths = postMediaPaths(post);

  useEffect(() => {
    let active = true;
    void (async () => {
      // Keep the effect body free of synchronous state updates; React's lint
      // rules treat that as a cascading render.
      await Promise.resolve();
      if (!active) return;
      if (paths.length === 0) {
        setMedia([]);
        return;
      }
      setMediaLoading(true);
      const resolved = await Promise.all(
        paths.map(async (path) => {
          const { data } = await supabase.storage
            .from("channel-media")
            .createSignedUrl(path, 3600);
          return data?.signedUrl
            ? { path, url: data.signedUrl, kind: kindOf(path) }
            : null;
        }),
      );
      if (!active) return;
      setMedia(resolved.filter((item): item is MediaItem => Boolean(item)));
      setMediaLoading(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, paths.join("|")]);

  const loadReactions = useCallback(async () => {
    const { data } = await supabase
      .from("channel_reactions")
      .select("emoji,user_id")
      .eq("post_id", post.id);
    const rows = (data ?? []) as { emoji: string; user_id: string }[];
    const grouped = new Map<string, { count: number; mine: boolean }>();
    for (const row of rows) {
      const current = grouped.get(row.emoji) ?? { count: 0, mine: false };
      grouped.set(row.emoji, {
        count: current.count + 1,
        mine: current.mine || row.user_id === currentProfile?.id,
      });
    }
    const known = new Set(REACTIONS);
    setReactions([
      ...REACTIONS.map((emoji) => ({
        emoji,
        count: grouped.get(emoji)?.count ?? 0,
        mine: grouped.get(emoji)?.mine ?? false,
      })),
      ...Array.from(grouped.entries())
        .filter(([emoji]) => !known.has(emoji))
        .map(([emoji, value]) => ({ emoji, ...value })),
    ]);
  }, [post.id, currentProfile?.id]);

  useEffect(() => {
    const run = Promise.resolve().then(() => loadReactions());
    return () => {
      void run;
    };
  }, [loadReactions]);

  const loadComments = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("channel_post_comments")
        .select("id,author_id,body,created_at")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("channel_post_comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post.id),
    ]);
    const rows = (data ?? []) as {
      id: string;
      author_id: string;
      body: string;
      created_at: string;
    }[];
    setComments(rows);
    setCommentCount(count ?? rows.length);
    const ids = Array.from(new Set(rows.map((row) => row.author_id)));
    if (ids.length > 0) {
      const { data: people } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", ids);
      if (mounted.current) {
        setCommentAuthors(
          Object.fromEntries(
            ((people ?? []) as Profile[]).map((person) => [person.id, person]),
          ),
        );
      }
    }
  }, [post.id]);

  useEffect(() => {
    if (!commentsEnabled) return;
    void supabase
      .from("channel_post_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id)
      .then(({ count }) => {
        if (mounted.current) setCommentCount(count ?? 0);
      });
  }, [commentsEnabled, post.id]);

  async function react(emoji: string) {
    if (!currentProfile) return;
    const mine = reactions.find((row) => row.emoji === emoji)?.mine;
    setReactions((current) =>
      current.map((row) => {
        if (row.emoji === emoji) {
          return {
            ...row,
            mine: !mine,
            count: Math.max(0, row.count + (mine ? -1 : 1)),
          };
        }
        // One reaction per member per post.
        return row.mine ? { ...row, mine: false, count: Math.max(0, row.count - 1) } : row;
      }),
    );
    const { error } = await supabase
      .from("channel_reactions")
      .delete()
      .eq("post_id", post.id)
      .eq("user_id", currentProfile.id);
    if (!error && !mine) {
      await supabase.from("channel_reactions").insert({
        post_id: post.id,
        user_id: currentProfile.id,
        emoji,
      });
    }
    await loadReactions();
  }

  async function togglePin() {
    setMenuOpen(false);
    const { error } = await supabase
      .from("channel_posts")
      .update({
        pinned: !post.pinned,
        pinned_at: post.pinned ? null : new Date().toISOString(),
      })
      .eq("id", post.id);
    if (error) setNotice(error.message);
    else onChanged?.();
  }

  async function deletePost() {
    setMenuOpen(false);
    const { error } = await supabase
      .from("channel_posts")
      .delete()
      .eq("id", post.id);
    if (error) setNotice(error.message);
    else onChanged?.();
  }

  async function share() {
    const url = `${window.location.origin}/app/channels/${channelId}#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PINGO channel post", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Post link copied.");
    } catch {
      // share sheet dismissed
    }
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    const body = commentText.trim();
    if (!body || !currentProfile || commentBusy) return;
    setCommentBusy(true);
    const { error } = await supabase.from("channel_post_comments").insert({
      post_id: post.id,
      channel_id: channelId,
      author_id: currentProfile.id,
      body: body.slice(0, 2000),
    });
    if (error) setNotice(error.message);
    else {
      setCommentText("");
      await loadComments();
    }
    setCommentBusy(false);
  }

  const author = currentProfile?.id === post.author_id;
  const published = post.published_at
    ? new Date(post.published_at).toLocaleString([], {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Draft";

  return (
    <article
      id={`post-${post.id}`}
      className="scroll-mt-20 border-b border-border/70 px-4 py-3.5 last:border-b-0"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
            <span>{published}</span>
            {post.pinned && (
              <span className="flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 font-medium text-primary">
                <Pin className="size-2.5" /> Pinned
              </span>
            )}
            <span className="ml-auto flex items-center gap-1 tabular-nums">
              <Eye className="size-3" /> {post.views.toLocaleString()}
            </span>
          </div>

          {post.body && (
            <p className="mt-1.5 text-[0.92rem] leading-6 break-words whitespace-pre-wrap">
              {linkify(post.body)}
            </p>
          )}

          {post.link_url && (
            <a
              href={post.link_url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-primary"
            >
              <Link2 className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{post.link_url}</span>
            </a>
          )}
        </div>

        {canManage && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground"
                aria-label="Post options"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => void togglePin()}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-secondary"
              >
                {post.pinned ? (
                  <PinOff className="size-4" />
                ) : (
                  <Pin className="size-4" />
                )}
                {post.pinned ? "Unpin post" : "Pin post"}
              </button>
              <button
                type="button"
                onClick={() => void deletePost()}
                className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" /> Delete post
              </button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {mediaLoading && paths.length > 0 && (
        <div className="mt-2 flex h-32 items-center justify-center rounded-xl bg-secondary">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {media.length > 0 && (
        <div
          className={cn(
            "mt-2 grid gap-1",
            media.length === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {media.map((item, index) => (
            <button
              key={item.path}
              type="button"
              onClick={() => setViewerIndex(index)}
              className={cn(
                "relative overflow-hidden rounded-lg bg-secondary",
                media.length === 1 ? "max-h-[420px]" : "aspect-square",
              )}
              aria-label={`Open attachment ${index + 1}`}
            >
              {item.kind === "image" ? (
                <img
                  src={item.url}
                  alt=""
                  loading="lazy"
                  className={cn(
                    "w-full object-cover",
                    media.length === 1 ? "max-h-[420px] object-contain bg-black" : "size-full",
                  )}
                />
              ) : item.kind === "video" ? (
                <video
                  src={item.url}
                  className="size-full object-cover"
                  preload="metadata"
                  muted
                />
              ) : (
                <span className="flex size-full min-h-24 flex-col items-center justify-center gap-1 text-muted-foreground">
                  <FileText className="size-5" />
                  <span className="max-w-full truncate px-2 text-[0.6rem]">
                    {post.media_meta?.[index]?.name ??
                      item.path.split("/").pop() ??
                      "Document"}
                  </span>
                </span>
              )}
              {item.kind === "video" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-black/55 text-white">
                    ▶
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {commentsEnabled && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {reactions
            .filter((row) => row.count > 0 || REACTIONS.includes(row.emoji))
            .map((row) => (
              <button
                key={row.emoji}
                type="button"
                onClick={() => void react(row.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem] transition-colors",
                  row.mine
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
                aria-label={`React ${row.emoji}`}
              >
                <span>{row.emoji}</span>
                {row.count > 0 && <span className="tabular-nums">{row.count}</span>}
              </button>
            ))}
        </div>
      )}

      {!commentsEnabled && reactions.some((row) => row.count > 0 || row.mine) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {reactions
            .filter((row) => row.count > 0)
            .map((row) => (
              <button
                key={row.emoji}
                type="button"
                onClick={() => void react(row.emoji)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.68rem]",
                  row.mine
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                <span>{row.emoji}</span>
                <span className="tabular-nums">{row.count}</span>
              </button>
            ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-1 text-muted-foreground">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add reaction"
              className="flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] hover:bg-secondary"
            >
              <Smile className="size-3.5" /> React
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-1.5">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void react(emoji)}
                  className="flex size-8 items-center justify-center rounded-full text-base hover:bg-secondary"
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {commentsEnabled && (
          <button
            type="button"
            onClick={() => {
              setCommentsOpen((open) => !open);
              if (!commentsOpen) void loadComments();
            }}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] hover:bg-secondary"
          >
            <MessageCircle className="size-3.5" />
            {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "Leave a comment"}
          </button>
        )}

        <button
          type="button"
          onClick={() => void share()}
          className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-[0.65rem] hover:bg-secondary"
        >
          <Share2 className="size-3.5" /> Share
        </button>
      </div>

      {notice && (
        <div className="mt-2 flex items-start gap-2 rounded-md bg-secondary px-2.5 py-1.5 text-[0.65rem]">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="size-3" />
          </button>
        </div>
      )}

      {commentsEnabled && commentsOpen && (
        <div className="mt-2 rounded-lg border border-border bg-card p-2">
          {comments.length === 0 ? (
            <p className="px-1 py-2 text-[0.65rem] text-muted-foreground">
              No comments yet. Start the discussion.
            </p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto px-1">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.6rem] font-semibold text-primary">
                    {(commentAuthors[comment.author_id]?.display_name ||
                      commentAuthors[comment.author_id]?.username ||
                      "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.65rem] font-semibold">
                      {commentAuthors[comment.author_id]?.display_name ||
                        commentAuthors[comment.author_id]?.username ||
                        "PINGO user"}
                      <span className="ml-1.5 font-normal text-muted-foreground">
                        {new Date(comment.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                    <p className="text-[0.78rem] leading-5 break-words whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                  {(comment.author_id === currentProfile?.id || canManage) && (
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase
                          .from("channel_post_comments")
                          .delete()
                          .eq("id", comment.id);
                        await loadComments();
                      }}
                      aria-label="Delete comment"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <form onSubmit={(event) => void addComment(event)} className="mt-2 flex items-center gap-1.5">
            <input
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              maxLength={2000}
              placeholder="Leave a comment"
              className="h-8 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-xs outline-none focus:border-primary"
            />
            <Button
              type="submit"
              size="icon"
              className="size-8 shrink-0 rounded-full"
              disabled={!commentText.trim() || commentBusy}
              aria-label="Send comment"
            >
              {commentBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          </form>
        </div>
      )}

      <Dialog
        open={viewerIndex !== null}
        onOpenChange={(open) => {
          if (!open) setViewerIndex(null);
        }}
      >
        <DialogContent className="max-w-4xl border-0 bg-black/95 p-0 text-white">
          <DialogTitle className="sr-only">Channel attachment</DialogTitle>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-xs text-white/70">
              {viewerIndex !== null ? `${viewerIndex + 1} / ${media.length}` : ""}
            </p>
            <button
              type="button"
              onClick={() => setViewerIndex(null)}
              aria-label="Close attachment"
              className="rounded p-1.5 hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex max-h-[78dvh] items-center justify-center overflow-hidden p-2">
            {viewerIndex !== null && media[viewerIndex] ? (
              media[viewerIndex].kind === "image" ? (
                <img
                  src={media[viewerIndex].url}
                  alt=""
                  className="max-h-[74dvh] max-w-full object-contain"
                />
              ) : media[viewerIndex].kind === "video" ? (
                <video
                  src={media[viewerIndex].url}
                  controls
                  autoPlay
                  className="max-h-[74dvh] w-full"
                />
              ) : (
                <a
                  href={media[viewerIndex].url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-white/10 px-4 py-3 text-sm text-white underline"
                >
                  Open document
                </a>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {author && <span className="sr-only">Published by you</span>}
    </article>
  );
}
