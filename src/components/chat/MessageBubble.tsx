import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { signedMediaUrl } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import { bytesLabel, timeOf } from "@/lib/format";
import type { Message, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  Flag,
  Forward,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Reply,
  SmilePlus,
  Trash2,
  UserX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀"];

/**
 * Status replies keep their context in the conversation. While the status is
 * still inside its 24h window we show a real signed thumbnail; afterwards the
 * row is already hidden by RLS and we show a neutral expired placeholder.
 */
function StatusReplyReference({ statusId }: { statusId: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<{
    checked: boolean;
    active: boolean;
    userId: string | null;
    label: string;
    thumbnail: string | null;
  }>({ checked: false, active: false, userId: null, label: "", thumbnail: null });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("status_updates")
        .select("user_id,kind,body,media_path,expires_at")
        .eq("id", statusId)
        .maybeSingle();
      if (!alive) return;
      const status = data as
        | {
            user_id: string;
            kind: string;
            body: string | null;
            media_path: string | null;
            expires_at: string;
          }
        | null;
      if (!status || new Date(status.expires_at).getTime() <= Date.now()) {
        setState((current) => ({ ...current, checked: true, active: false }));
        return;
      }
      const thumbnail = status.media_path
        ? await signedMediaUrl(status.media_path)
        : null;
      if (!alive) return;
      setState({
        checked: true,
        active: true,
        userId: status.user_id,
        thumbnail,
        label:
          status.body?.trim() ||
          (status.kind === "video" ? "Video status" : "Photo status"),
      });
    })();
    return () => {
      alive = false;
    };
  }, [statusId]);

  if (!state.checked) {
    return <div className="mb-1.5 h-11 animate-pulse rounded-md bg-primary/5" />;
  }
  if (!state.active) {
    return (
      <div className="mb-1.5 rounded-md border border-border/60 bg-secondary/60 px-2 py-1.5 text-[0.68rem] text-muted-foreground">
        This status is no longer available.
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (state.userId) {
          navigate(`/app/updates?statusUser=${state.userId}`);
        }
      }}
      className="mb-1.5 flex w-full items-center gap-2 overflow-hidden rounded-md border border-primary/25 bg-primary/5 p-1.5 text-left"
    >
      {state.thumbnail ? (
        <img
          src={state.thumbnail}
          alt=""
          className="size-9 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded bg-primary/10 text-sm">
          ✎
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[0.6rem] font-semibold text-primary">
          Replied to a status
        </span>
        <span className="block truncate text-[0.68rem] opacity-75">
          {state.label.slice(0, 70)}
        </span>
      </span>
    </button>
  );
}

type ReceiptState = "sent" | "delivered" | "read";

function Attachment({ message }: { message: Message }) {
  const { settings, profile } = useAuth();
  const [url, setUrl] = useState<string | null>(message.local_url ?? null);
  const [failed, setFailed] = useState(false);
  const [requested, setRequested] = useState(false);
  const [openWhenReady, setOpenWhenReady] = useState(false);
  const [consumed, setConsumed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoom, setViewerZoom] = useState(1);
  const isViewOnce = message.view_once === true;
  const isMine = message.sender_id === profile?.id;
  const shouldLoad = isViewOnce
    ? isMine || requested || Boolean(message.local_url)
    : settings?.auto_download_media !== false ||
      requested ||
      Boolean(message.local_url);

  useEffect(() => {
    let active = true;
    if (!message.attachment_path || message.local_url || !shouldLoad) return;
    signedMediaUrl(message.attachment_path).then((next) => {
      if (!active) return;
      if (next) setUrl(next);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [message.attachment_path, message.local_url, shouldLoad]);

  useEffect(() => {
    if (openWhenReady && url) {
      setOpenWhenReady(false);
      setViewerOpen(true);
    }
  }, [openWhenReady, url]);

  async function consumeViewOnce() {
    if (!isViewOnce || isMine || consumed) return;
    setConsumed(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/messages/view-once", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message_id: message.id }),
    }).catch(() => undefined);
  }

  if (isViewOnce && !message.attachment_path && !message.local_url) {
    return (
      <div className="mb-1.5 flex h-24 w-56 flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground">
        <span>View-once media opened</span>
        <span className="text-[0.6rem] opacity-70">It is no longer available.</span>
      </div>
    );
  }

  if (isViewOnce && !isMine && !requested && !consumed) {
    return (
      <button
        type="button"
        onClick={() => {
          setRequested(true);
          if (message.kind === "image") setOpenWhenReady(true);
        }}
        className="mb-1.5 flex h-28 w-56 flex-col items-center justify-center gap-1.5 rounded-md border border-current/15 bg-black/[0.03] text-xs dark:bg-white/[0.04]"
      >
        <span className="text-base">1×</span>
        <span className="font-medium">Open once</span>
        <span className="text-[0.6rem] opacity-60">
          {message.kind === "video" ? "View-once video" : "View-once photo"}
        </span>
      </button>
    );
  }

  if (!message.attachment_path && !message.local_url) return null;

  if (message.kind === "image") {
    return (
      <div className="mb-1.5 overflow-hidden rounded-md bg-muted">
        {url && !failed ? (
          <button type="button" onClick={() => setViewerOpen(true)}>
            <img
              src={url}
              alt={message.attachment_name ?? "Shared photo"}
              className="max-h-72 w-full max-w-[280px] object-cover"
              loading="lazy"
            />
          </button>
        ) : !shouldLoad && !failed ? (
          <button
            type="button"
            onClick={() => setRequested(true)}
            className="flex h-32 w-56 flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground"
          >
            <Download className="size-4" />
            <span>Download photo</span>
            {message.attachment_size ? (
              <span className="text-[0.6rem]">{bytesLabel(message.attachment_size)}</span>
            ) : null}
          </button>
        ) : (
          <div className="flex h-32 w-56 items-center justify-center text-xs text-muted-foreground">
            {failed ? "Photo unavailable" : "Loading photo…"}
          </div>
        )}
        <Dialog
          open={viewerOpen}
          onOpenChange={(open) => {
            setViewerOpen(open);
            if (!open) {
              setViewerZoom(1);
              if (isViewOnce) void consumeViewOnce();
            }
          }}
        >
          <DialogContent
            className="max-w-4xl border-0 bg-black p-2 text-white sm:max-w-4xl"
            showCloseButton={false}
          >
            <DialogTitle className="sr-only">
              {message.attachment_name ?? "Shared photo"}
            </DialogTitle>
            <div className="absolute top-2 right-2 z-10 flex gap-1">
              <button
                type="button"
                onClick={() => setViewerZoom((value) => Math.max(1, value - 0.5))}
                className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Zoom out"
              >
                <ZoomOut className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewerZoom((value) => Math.min(3, value + 0.5))}
                className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Zoom in"
              >
                <ZoomIn className="size-4" />
              </button>
              {url && (
                <a
                  href={url}
                  download={message.attachment_name ?? "pingo-photo"}
                  className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
                  aria-label="Download photo"
                >
                  <Download className="size-4" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setViewerOpen(false)}
                className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
                aria-label="Close photo"
              >
                <X className="size-4" />
              </button>
            </div>
            {url && (
              <img
                src={url}
                alt={message.attachment_name ?? "Shared photo"}
                className="max-h-[82dvh] w-full object-contain transition-transform"
                style={{ transform: `scale(${viewerZoom})` }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (message.kind === "video") {
    return url && !failed ? (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        onEnded={() => {
          if (isViewOnce) void consumeViewOnce();
        }}
        className="mb-1.5 max-h-72 w-full max-w-[280px] rounded-md bg-black"
      />
    ) : !shouldLoad && !failed ? (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="mb-1.5 flex h-32 w-56 flex-col items-center justify-center gap-1.5 rounded-md bg-muted text-xs text-muted-foreground"
      >
        <Download className="size-4" />
        <span>Download video</span>
        {message.attachment_size ? (
          <span className="text-[0.6rem]">{bytesLabel(message.attachment_size)}</span>
        ) : null}
      </button>
    ) : (
      <div className="mb-1.5 flex h-32 w-56 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
        {failed ? "Video unavailable" : "Loading video…"}
      </div>
    );
  }

  if (message.kind === "voice") {
    return <VoicePlayer message={message} url={url} failed={failed} />;
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "mb-1.5 flex items-center gap-3 rounded-lg border px-3 py-2.5",
        "border-current/15 bg-black/[0.03] dark:bg-white/[0.04]",
        !url && "pointer-events-none opacity-60",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-current/10">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">
          {message.attachment_name ?? "Attachment"}
        </span>
        <span className="block text-[0.65rem] opacity-70">
          {bytesLabel(message.attachment_size)}
          {message.attachment_mime ? ` · ${message.attachment_mime}` : ""}
        </span>
      </span>
      <Download className="size-4 shrink-0 opacity-70" />
    </a>
  );
}

function VoicePlayer({
  message,
  url,
  failed,
}: {
  message: Message;
  url: string | null;
  failed: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(message.duration_seconds ?? 0);
  const [rate, setRate] = useState(1);
  const peaks = message.waveform ?? [];
  const total = seconds || message.duration_seconds || 0;

  return (
    <div className="mb-1 flex min-w-[210px] items-center gap-2">
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const duration = event.currentTarget.duration;
            if (Number.isFinite(duration)) setSeconds(duration);
          }}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
        />
      )}
      <button
        type="button"
        disabled={!url}
        onClick={() => {
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) {
            audio.pause();
            setPlaying(false);
          } else {
            audio.playbackRate = rate;
            void audio.play();
            setPlaying(true);
          }
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-current/15"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>

      <button
        type="button"
        disabled={!url}
        aria-label="Seek voice message"
        className="flex h-8 flex-1 items-center gap-[2px] text-left"
        onClick={(event) => {
          const audio = audioRef.current;
          if (!audio || !audio.duration) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = Math.min(
            1,
            Math.max(0, (event.clientX - rect.left) / rect.width),
          );
          audio.currentTime = ratio * audio.duration;
          setProgress(ratio);
        }}
      >
        {peaks.length > 0
          ? peaks.map((peak, index) => (
              <span
                key={index}
                className={cn(
                  "w-[2px] shrink-0 rounded-full transition-colors",
                  index / peaks.length <= progress
                    ? "bg-current"
                    : "bg-current/30",
                )}
                style={{ height: `${Math.max(4, (peak / 100) * 26)}px` }}
              />
            ))
          : (
            <span className="relative h-[2px] w-full rounded-full bg-current/25">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-current"
                style={{ width: `${progress * 100}%` }}
              />
            </span>
          )}
      </button>

      <button
        type="button"
        disabled={!url}
        className="shrink-0 rounded px-1 text-[0.62rem] font-semibold opacity-80"
        aria-label="Change playback speed"
        onClick={() => {
          const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
          setRate(next);
          if (audioRef.current) audioRef.current.playbackRate = next;
        }}
      >
        {rate}×
      </button>
      <span className="w-8 shrink-0 text-right text-[0.62rem] tabular-nums opacity-70">
        {failed ? "—" : `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, "0")}`}
      </span>
    </div>
  );
}

export function MessageBubble({
  message,
  own,
  sender,
  isGroup,
  replyTo,
  replySenderName,
  receipt,
  reactions,
  currentUserId,
  canModerate,
  onReply,
  onReact,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
  onReport,
  onCopy,
  onBlock,
  onRetry,
  onForward,
  onTogglePin,
  pinned,
  showAvatar,
}: {
  message: Message;
  own: boolean;
  sender: Profile | null | undefined;
  isGroup: boolean;
  replyTo?: Message | null;
  replySenderName?: string | null;
  receipt: ReceiptState;
  reactions: { emoji: string; users: string[] }[];
  currentUserId: string;
  canModerate: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit: (body: string) => Promise<void>;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  onReport: () => void;
  onCopy: () => void;
  onBlock?: () => void;
  onRetry?: () => void;
  onForward?: () => void;
  onTogglePin?: () => void;
  pinned?: boolean;
  showAvatar: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiping = useRef(false);
  const suppressClick = useRef(false);

  // Deletion for everyone removes the message entirely — no tombstone.
  if (message.deleted_at) return null;
  if (message.kind === "system") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[0.68rem] font-medium text-muted-foreground">
          {sender?.display_name || "Someone"} {message.body}
        </span>
      </div>
    );
  }

  const isOwn = own;

  return (
    <div
      className={cn(
        "group flex w-full gap-2",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      {!isOwn && isGroup && (
        <span className="mt-auto w-8 shrink-0">
          {showAvatar && (
            <UserAvatar profile={sender ?? { id: message.sender_id }} size="xs" />
          )}
        </span>
      )}

      <div
        className={cn(
          "relative max-w-[86%] sm:max-w-[72%]",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {!isOwn && isGroup && showAvatar && (
          <p className="mb-0.5 pl-1 text-[0.68rem] font-semibold text-primary">
            {sender?.display_name || "Unknown"}
          </p>
        )}

        <div
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setActionsOpen((open) => !open);
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            swipeStart.current = { x: event.clientX, y: event.clientY };
            swiping.current = false;
          }}
          onPointerMove={(event) => {
            const start = swipeStart.current;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!swiping.current) {
              if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) swiping.current = true;
              else if (Math.abs(dy) > 10) swipeStart.current = null;
            }
            if (swiping.current) setSwipeX(Math.min(72, Math.max(0, dx)));
          }}
          onPointerUp={() => {
            if (swiping.current && swipeX >= 52) {
              onReply();
              suppressClick.current = true;
            }
            swipeStart.current = null;
            swiping.current = false;
            setSwipeX(0);
          }}
          onPointerCancel={() => {
            swipeStart.current = null;
            swiping.current = false;
            setSwipeX(0);
          }}
          style={{
            transform: swipeX ? `translateX(${swipeX}px)` : undefined,
            touchAction: "pan-y",
          }}
          className={cn(
            "px-2.5 py-1.5 text-[0.86rem] leading-[1.45] transition-colors",
            isOwn
              ? "rounded-[10px] rounded-br-[3px] bg-bubble-out text-bubble-out-foreground"
              : "rounded-[10px] rounded-bl-[3px] border border-border/70 bg-bubble-in text-bubble-in-foreground",
          )}
        >
          {replyTo && (
            <div className="mb-1.5 rounded-md border-l-2 border-primary bg-primary/5 px-2 py-1 text-[0.72rem]">
              <p className="font-bold opacity-90">{replySenderName || "Message"}</p>
              <p className="line-clamp-2 opacity-70">
                {replyTo.deleted_at
                  ? "Message removed"
                  : replyTo.body || (replyTo.kind === "image" ? "Photo" : "Attachment")}
              </p>
            </div>
          )}

          {message.status_reply_to && (
            <StatusReplyReference statusId={message.status_reply_to} />
          )}

          <Attachment message={message} />

          {editing ? (
            <div className="min-w-[220px]">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="min-h-16 bg-background text-sm text-foreground"
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving || !draft.trim()}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onEdit(draft.trim());
                      setEditing(false);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            message.body && (
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            )
          )}

          <div
            className={cn(
              "mt-0.5 flex items-center justify-end gap-1 text-[0.62rem]",
              isOwn ? "text-bubble-out-foreground/55" : "text-muted-foreground",
            )}
          >
            {message.edited_at && <span>edited</span>}
            <span>{timeOf(message.created_at)}</span>
            {isOwn && message.status === "sending" && <span>Sending…</span>}
            {isOwn && message.status === "failed" && onRetry && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry();
                }}
                className="font-semibold text-destructive underline underline-offset-2"
              >
                Failed · Retry
              </button>
            )}
            {isOwn &&
              !message.status &&
              (receipt === "read" ? (
                <CheckCheck className="size-3.5 text-primary" aria-label="Read" />
              ) : receipt === "delivered" ? (
                <CheckCheck
                  className="size-3.5 opacity-55"
                  aria-label="Delivered"
                />
              ) : (
                <Check className="size-3.5" aria-label="Sent" />
              ))}
          </div>
        </div>

        {reactions.length > 0 && (
          <div
            className={cn(
              "mt-1 flex flex-wrap gap-1",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {reactions.map((reaction) => {
              const mine = reaction.users.includes(currentUserId);
              return (
                <button
                  key={reaction.emoji}
                  type="button"
                  onClick={() => onReact(reaction.emoji)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.68rem]",
                    mine
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-card",
                  )}
                  aria-label={`${reaction.emoji} ${reaction.users.length} reactions`}
                >
                  <span>{reaction.emoji}</span>
                  <span className="text-[0.62rem] font-semibold text-muted-foreground">
                    {reaction.users.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div
          className={cn(
            "mt-0.5 flex items-center gap-0.5 transition-opacity focus-within:opacity-100",
            actionsOpen ? "opacity-100" : "opacity-0 sm:group-hover:opacity-100",
            isOwn ? "justify-end" : "justify-start",
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add a reaction"
                className="size-7 text-muted-foreground"
              >
                <SmilePlus className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"} className="flex gap-1 p-1.5">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact(emoji)}
                  className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-accent"
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReply}
            aria-label="Reply"
            className="size-7 text-muted-foreground"
          >
            <Reply className="size-3.5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More message actions"
                className="size-7 text-muted-foreground"
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48">
              <DropdownMenuItem onSelect={onCopy}>
                <Copy className="size-4" /> Copy text
              </DropdownMenuItem>
              {isOwn && (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit message
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onReply}>
                <Reply className="size-4" /> Reply
              </DropdownMenuItem>
              {onForward && (
                <DropdownMenuItem onSelect={onForward}>
                  <Forward className="size-4" /> Forward
                </DropdownMenuItem>
              )}
              {onTogglePin && (
                <DropdownMenuItem onSelect={onTogglePin}>
                  {pinned ? (
                    <PinOff className="size-4" />
                  ) : (
                    <Pin className="size-4" />
                  )}
                  {pinned ? "Unpin message" : "Pin message"}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDeleteForMe}>
                <Trash2 className="size-4" /> Delete for me
              </DropdownMenuItem>
              {(isOwn || canModerate) && (
                <DropdownMenuItem variant="destructive" onSelect={onDeleteForEveryone}>
                  <UserX className="size-4" />
                  {isOwn ? "Delete for everyone" : "Remove for everyone"}
                </DropdownMenuItem>
              )}
              {!isOwn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onReport}>
                    <Flag className="size-4" /> Report message
                  </DropdownMenuItem>
                  {onBlock && (
                    <DropdownMenuItem variant="destructive" onSelect={onBlock}>
                      <UserX className="size-4" /> Block sender
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
