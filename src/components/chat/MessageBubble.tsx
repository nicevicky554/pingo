import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { signedMediaUrl } from "@/lib/chat";
import { bytesLabel, durationLabel, timeOf } from "@/lib/format";
import type { Message, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCheck,
  Copy,
  Download,
  FileText,
  Flag,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Reply,
  SmilePlus,
  Trash2,
  UserX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "🙏", "👀"];

type ReceiptState = "sent" | "delivered" | "read";

function Attachment({ message }: { message: Message }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!message.attachment_path) return;
    signedMediaUrl(message.attachment_path).then((next) => {
      if (!active) return;
      if (next) setUrl(next);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [message.attachment_path]);

  if (!message.attachment_path) return null;

  if (message.kind === "image") {
    return (
      <div className="mb-1.5 overflow-hidden rounded-lg bg-muted">
        {url && !failed ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={message.attachment_name ?? "Shared photo"}
              className="max-h-72 w-full max-w-xs object-cover"
              loading="lazy"
            />
          </a>
        ) : (
          <div className="flex h-32 w-56 items-center justify-center text-xs text-muted-foreground">
            {failed ? "Photo unavailable" : "Loading photo…"}
          </div>
        )}
      </div>
    );
  }

  if (message.kind === "voice") {
    return (
      <VoicePlayer
        url={url}
        minutes={durationLabel(message.duration_seconds)}
        failed={failed}
      />
    );
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
  url,
  minutes,
  failed,
}: {
  url: string | null;
  minutes: string;
  failed: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <div className="mb-1 flex min-w-[190px] items-center gap-2.5">
      {url && (
        <audio
          ref={audioRef}
          src={url}
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
            void audio.play();
            setPlaying(true);
          }
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-current/15"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <span className="flex h-7 flex-1 items-center gap-[2px]">
        {Array.from({ length: 26 }).map((_, index) => {
          const height = 5 + ((index * 7) % 17);
          const played = index / 26 <= progress;
          return (
            <span
              key={index}
              className={cn(
                "w-[2px] rounded-full",
                played ? "bg-current" : "bg-current/30",
              )}
              style={{ height }}
            />
          );
        })}
      </span>
      <span className="text-[0.65rem] font-medium opacity-70">
        {failed ? "Unavailable" : minutes}
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
  showAvatar: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);

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
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[0.84rem] leading-[1.45]",
            isOwn
              ? "rounded-br-md bg-primary text-primary-foreground"
              : "rounded-bl-md border border-border bg-card text-card-foreground",
          )}
        >
          {replyTo && (
            <div
              className={cn(
                "mb-2 rounded-lg border-l-2 px-2.5 py-1.5 text-[0.72rem]",
                isOwn
                  ? "border-primary-foreground/60 bg-primary-foreground/10"
                  : "border-primary bg-primary/5",
              )}
            >
              <p className="font-bold opacity-90">{replySenderName || "Message"}</p>
              <p className="line-clamp-2 opacity-70">
                {replyTo.deleted_at
                  ? "Message removed"
                  : replyTo.body || (replyTo.kind === "image" ? "Photo" : "Attachment")}
              </p>
            </div>
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
              "mt-1 flex items-center justify-end gap-1 text-[0.6rem]",
              isOwn ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {message.edited_at && <span>edited</span>}
            <span>{timeOf(message.created_at)}</span>
            {isOwn &&
              (receipt === "read" ? (
                <CheckCheck className="size-3.5 text-sky-200" aria-label="Read" />
              ) : receipt === "delivered" ? (
                <CheckCheck className="size-3.5" aria-label="Delivered" />
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
            "mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
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
