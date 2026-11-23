import { Composer, type OutgoingMessage } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  listConversations,
  listHiddenMessageIds,
  listMessages,
  listReactions,
  listReceipts,
  markConversationRead,
  sendMessage,
  signedMediaUrl,
  uploadChatAttachment,
} from "@/lib/chat";
import { dayLabel, lastSeenLabel, timeOf } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { freshPrivateChannel } from "@/lib/realtime";
import { Link, useNavigate } from "react-router";
import type {
  ConversationMember,
  ConversationSummary,
  Message,
  Profile,
} from "@/lib/types";
import { usePresence } from "@/providers/PresenceProvider";
import { useCall } from "@/providers/CallProvider";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArrowLeft,
  BellOff,
  Loader2,
  MoreVertical,
  Phone,
  Search,
  Video,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type MemberWithProfile = ConversationMember & { profile: Profile | null };
type ReceiptRow = { message_id: string; user_id: string; status: string };
type ReactionRow = { message_id: string; user_id: string; emoji: string };

export function ChatThread({
  conversation,
  members,
  currentUserId,
  currentProfile,
  onBack,
  onChanged,
}: {
  conversation: ConversationSummary;
  members: MemberWithProfile[];
  currentUserId: string;
  currentProfile: Profile;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [activities, setActivities] = useState<
    Record<string, { label: string; expiry: number }>
  >({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [forwardTargets, setForwardTargets] = useState<ConversationSummary[]>([]);
  const [forwardBusy, setForwardBusy] = useState<string | null>(null);

  const { online } = usePresence();
  const { startCall } = useCall();
  const { settings } = useAuth();
  const statusRings = useStatusRings();
  const navigate = useNavigate();
  const receiptsEnabled = settings?.read_receipts !== false;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const pendingRef = useRef(
    new Map<
      string,
      {
        outgoing: OutgoingMessage;
        onProgress: (percent: number) => void;
        replyToId: string | null;
      }
    >(),
  );
  const lastTypingSent = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isGroup = conversation.type === "group";
  const peer = useMemo(
    () =>
      members.find((member) => member.user_id !== currentUserId)?.profile ?? null,
    [members, currentUserId],
  );
  const title =
    conversation.title ||
    peer?.display_name ||
    peer?.username ||
    "Conversation";
  const canModerate = conversation.role === "owner" || conversation.role === "admin";

  const avatarProfile = isGroup
    ? {
        id: conversation.id,
        display_name: title,
        avatar_path: null,
        public_avatar_url: conversation.avatar_url,
      }
    : peer;

  const nameFor = useCallback(
    (userId: string) =>
      userId === currentUserId
        ? "You"
        : members.find((member) => member.user_id === userId)?.profile
            ?.display_name ||
          members.find((member) => member.user_id === userId)?.profile?.username ||
          "PINGO user",
    [members, currentUserId],
  );

  const refreshReceipts = useCallback(async () => {
    const ids = messagesRef.current.map((message) => message.id);
    setReceipts(await listReceipts(ids));
    setReactions(await listReactions(ids));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await listMessages(conversation.id);
      const hidden = await listHiddenMessageIds(
        currentUserId,
        raw.map((message) => message.id),
      );
      const visible = raw.filter((message) => !hidden.includes(message.id));
      messagesRef.current = visible;
      setMessages(visible);
      setReceipts(await listReceipts(visible.map((message) => message.id)));
      setReactions(await listReactions(visible.map((message) => message.id)));
      await markConversationRead(
        conversation.id,
        currentUserId,
        visible,
        receiptsEnabled,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Messages could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversation.id, currentUserId, receiptsEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: messages, receipts, reactions and typing over one private channel.
  useEffect(() => {
    const channel = freshPrivateChannel(`conversation:${conversation.id}`, {
      private: true,
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((current) => {
            if (current.some((message) => message.id === incoming.id)) return current;
            return [...current, incoming];
          });
          messagesRef.current = [...messagesRef.current, incoming];
          if (incoming.sender_id !== currentUserId) {
            void markConversationRead(
              conversation.id,
              currentUserId,
              [incoming],
              receiptsEnabled,
            );
            setTyping((current) => {
              const next = { ...current };
              delete next[incoming.sender_id];
              return next;
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((current) =>
            current.map((message) =>
              message.id === updated.id ? updated : message,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_receipts" },
        () => void refreshReceipts(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => void refreshReceipts(),
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as { user_id?: string; name?: string };
        if (!data?.user_id || data.user_id === currentUserId) return;
        setTyping((current) => ({
          ...current,
          [data.user_id!]: Date.now() + 3500,
        }));
      })
      .on("broadcast", { event: "stop_typing" }, ({ payload }) => {
        const data = payload as { user_id?: string };
        if (!data?.user_id) return;
        setTyping((current) => {
          const next = { ...current };
          delete next[data.user_id!];
          return next;
        });
      })
      .on("broadcast", { event: "activity" }, ({ payload }) => {
        const data = payload as { user_id?: string; activity?: string };
        if (!data?.user_id || data.user_id === currentUserId) return;
        setActivities((current) => {
          const next = { ...current };
          if (data.activity) {
            next[data.user_id!] = {
              label: data.activity,
              expiry: Date.now() + 5000,
            };
          } else {
            delete next[data.user_id!];
          }
          return next;
        });
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // `receiptsEnabled` is read through a ref-like closure; re-subscribing for a
    // preference change is unnecessary and risks a topic reuse race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, currentUserId, refreshReceipts]);

  // Expire stale typing indicators rather than showing them forever.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTyping((current) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [id, expiry] of Object.entries(current)) {
          if (expiry > Date.now()) next[id] = expiry;
          else changed = true;
        }
        return changed ? next : current;
      });
      setActivities((current) => {
        const next: typeof current = {};
        let changed = false;
        for (const [id, value] of Object.entries(current)) {
          if (value.expiry > Date.now()) next[id] = value;
          else changed = true;
        }
        return changed ? next : current;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const notifyActivity = useCallback(
    (activity: "" | "recording" | "uploading") => {
      void channelRef.current?.send({
        type: "broadcast",
        event: "activity",
        payload: { user_id: currentUserId, activity },
      });
    },
    [currentUserId],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, conversation.id]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    void channelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: currentUserId, name: currentProfile.display_name },
    });
  }, [currentUserId, currentProfile.display_name]);

  /** Deliver an already-visible optimistic message. */
  async function deliver(tempId: string) {
    const pending = pendingRef.current.get(tempId);
    if (!pending) return;
    const { outgoing, onProgress, replyToId } = pending;

    setMessages((current) =>
      current.map((message) =>
        message.id === tempId ? { ...message, status: "sending" } : message,
      ),
    );

    try {
      let attachmentPath: string | null = null;
      if (outgoing.file) {
        notifyActivity("uploading");
        attachmentPath = await uploadChatAttachment(
          conversation.id,
          outgoing.file,
          outgoing.fileName ?? "attachment",
          onProgress,
        );
        notifyActivity("");
      }

      const sent = await sendMessage({
        conversationId: conversation.id,
        senderId: currentUserId,
        body: outgoing.body,
        kind: outgoing.kind,
        attachmentPath,
        attachmentName: outgoing.fileName ?? null,
        attachmentSize: outgoing.file?.size ?? null,
        attachmentMime: outgoing.file?.type ?? null,
        durationSeconds: outgoing.durationSeconds ?? null,
        waveform: outgoing.waveform ?? null,
        replyToId,
        disappearSeconds: conversation.disappear_seconds,
        viewOnce: outgoing.viewOnce,
      });

      setMessages((current) => {
        let replaced = false;
        const next = current.flatMap((message) => {
          if (message.id === tempId) {
            replaced = true;
            return [sent];
          }
          // Realtime may have inserted the server row before this resolves.
          if (message.id === sent.id) return [];
          return [message];
        });
        if (!replaced && !next.some((message) => message.id === sent.id)) {
          next.push(sent);
        }
        messagesRef.current = next;
        return next;
      });
      pendingRef.current.delete(tempId);
      setReplyTo(null);
      void channelRef.current?.send({
        type: "broadcast",
        event: "stop_typing",
        payload: { user_id: currentUserId },
      });
      onChanged();
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.id === tempId ? { ...message, status: "failed" } : message,
        ),
      );
      notifyActivity("");
      throw err;
    }
  }

  async function handleSend(
    outgoing: OutgoingMessage,
    onProgress: (percent: number) => void,
  ) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const localUrl = outgoing.file
      ? URL.createObjectURL(outgoing.file)
      : undefined;
    const now = new Date().toISOString();
    const temp: Message = {
      id: tempId,
      conversation_id: conversation.id,
      sender_id: currentUserId,
      body: outgoing.body,
      kind: outgoing.kind ?? "text",
      view_once: outgoing.viewOnce,
      attachment_path: null,
      attachment_name: outgoing.fileName ?? null,
      attachment_size: outgoing.file?.size ?? null,
      attachment_mime: outgoing.file?.type ?? null,
      duration_seconds: outgoing.durationSeconds ?? null,
      waveform: outgoing.waveform ?? null,
      reply_to_id: replyTo?.id ?? null,
      edited_at: null,
      deleted_at: null,
      created_at: now,
      expires_at: null,
      status: "sending",
      local_url: localUrl,
    };

    pendingRef.current.set(tempId, {
      outgoing,
      onProgress,
      replyToId: replyTo?.id ?? null,
    });
    setMessages((current) => {
      const next = [...current, temp];
      messagesRef.current = next;
      return next;
    });
    if (!outgoing.file) {
      void channelRef.current?.send({
        type: "broadcast",
        event: "stop_typing",
        payload: { user_id: currentUserId },
      });
    }
    await deliver(tempId);
  }

  async function openForward(message: Message) {
    setForwarding(message);
    try {
      const list = await listConversations(currentUserId);
      setForwardTargets(list.filter((item) => item.id !== conversation.id));
    } catch {
      setForwardTargets([]);
    }
  }

  async function forwardTo(target: ConversationSummary) {
    if (!forwarding || forwardBusy) return;
    setForwardBusy(target.id);
    try {
      let attachmentPath: string | null = null;
      if (forwarding.attachment_path) {
        const url = await signedMediaUrl(forwarding.attachment_path);
        if (!url) throw new Error("The attachment could not be read.");
        const blob = await (await fetch(url)).blob();
        attachmentPath = await uploadChatAttachment(
          target.id,
          blob,
          forwarding.attachment_name ?? "forwarded",
        );
      }
      await sendMessage({
        conversationId: target.id,
        senderId: currentUserId,
        body: forwarding.body,
        kind: forwarding.kind,
        attachmentPath,
        attachmentName: forwarding.attachment_name,
        attachmentSize: forwarding.attachment_size,
        attachmentMime: forwarding.attachment_mime,
        durationSeconds: forwarding.duration_seconds,
        waveform: forwarding.waveform,
      });
      setForwarding(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not forward the message.");
      setForwarding(null);
    } finally {
      setForwardBusy(null);
    }
  }

  async function toggleReaction(message: Message, emoji: string) {
    const mine = reactions.find(
      (reaction) =>
        reaction.message_id === message.id &&
        reaction.user_id === currentUserId &&
        reaction.emoji === emoji,
    );
    if (mine) {
      await supabase
        .from("message_reactions")
        .delete()
        .match({
          message_id: message.id,
          user_id: currentUserId,
          emoji,
        });
    } else {
      // One active reaction per user per message: replacing the emoji updates
      // the existing row instead of adding a second reaction.
      await supabase.from("message_reactions").upsert(
        {
          message_id: message.id,
          user_id: currentUserId,
          emoji,
        },
        { onConflict: "message_id,user_id" },
      );
    }
    await refreshReceipts();
  }

  async function editMessage(message: Message, body: string) {
    const { error: updateError } = await supabase
      .from("messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", message.id);
    if (updateError) throw updateError;
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? { ...item, body, edited_at: new Date().toISOString() }
          : item,
      ),
    );
    onChanged();
  }

  async function deleteForMe(message: Message) {
    setMessages((current) => current.filter((item) => item.id !== message.id));
    messagesRef.current = messagesRef.current.filter(
      (item) => item.id !== message.id,
    );
    await supabase.from("message_deletions").insert({
      message_id: message.id,
      user_id: currentUserId,
    });
    onChanged();
  }

  async function deleteForEveryone(message: Message) {
    const { error: deleteError } = await supabase
      .from("messages")
      .update({
        deleted_at: new Date().toISOString(),
        body: "",
        attachment_path: null,
      })
      .eq("id", message.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? {
              ...item,
              deleted_at: new Date().toISOString(),
              body: "",
              attachment_path: null,
            }
          : item,
      ),
    );
    onChanged();
  }

  async function reportMessage(message: Message) {
    await supabase.from("moderation_reports").insert({
      reporter_id: currentUserId,
      target_type: "message",
      target_id: message.id,
      reason: "Reported from conversation",
      details: message.body.slice(0, 400),
    });
  }

  async function blockSender(userId: string) {
    await supabase.from("blocks").insert({
      blocker_id: currentUserId,
      blocked_id: userId,
    });
    setError("This person is blocked. Their presence and profile are now hidden.");
    onChanged();
  }

  async function setMemberFlag(patch: { muted?: boolean; archived?: boolean }) {
    await supabase
      .from("conversation_members")
      .update(patch)
      .eq("conversation_id", conversation.id)
      .eq("user_id", currentUserId);
    onChanged();
    if (patch.archived === true) onBack();
  }

  const typingNames = Object.keys(typing).map((id) => nameFor(id));
  const activityEntries = Object.entries(activities);
  const primaryActivity = activityEntries[0];
  const activityLabel = primaryActivity
    ? primaryActivity[1].label === "recording"
      ? "Recording audio…"
      : "Uploading a file…"
    : null;
  const peerOnline =
    !isGroup &&
    peer?.online_visibility === "everyone" &&
    online.has(peer.id);

  const visibleMessages = searchTerm.trim()
    ? messages.filter((message) =>
        message.body.toLowerCase().includes(searchTerm.trim().toLowerCase()),
      )
    : messages;

  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = [];
    for (const message of visibleMessages) {
      const day = dayLabel(message.created_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(message);
      else groups.push({ day, items: [message] });
    }
    return groups;
  }, [visibleMessages]);

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-2 sm:h-16 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-5" />
        </Button>

        {isGroup ? (
          <Link to={`/app/groups/${conversation.id}`} aria-label="Open group info">
            <UserAvatar profile={avatarProfile} size="md" showPresence={false} />
          </Link>
        ) : peer ? (
          <button
            type="button"
            aria-label={
              statusRings[peer.id]
                ? `View ${title}'s status`
                : `Open ${title}'s profile`
            }
            className="rounded-full"
            onClick={() =>
              navigate(
                statusRings[peer.id]
                  ? `/app/updates?statusUser=${peer.id}`
                  : `/app/profile/${peer.id}`,
              )
            }
          >
            <UserAvatar
              profile={avatarProfile}
              size="md"
              showPresence
              ring={statusRings[peer.id] ?? null}
            />
          </button>
        ) : (
          <UserAvatar profile={avatarProfile} size="md" showPresence={false} />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-semibold">
            {isGroup || peer ? (
              <Link
                to={isGroup ? `/app/groups/${conversation.id}` : `/app/profile/${peer!.id}`}
                className="hover:underline"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {activityLabel ? (
              <span className="font-medium text-primary">{activityLabel}</span>
            ) : typingNames.length > 0 ? (
              <span className="font-medium text-primary">
                {typingNames.length === 1
                  ? "Typing…"
                  : `${typingNames.length} people typing…`}
              </span>
            ) : isGroup ? (
              `${members.length} members${conversation.announce_only ? " · admins post" : ""}`
            ) : peerOnline ? (
              <span className="text-online">Online</span>
            ) : (
              "Offline"
            )}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Search this conversation"
          className="text-muted-foreground"
          onClick={() => {
            setSearchOpen((open) => !open);
            setSearchTerm("");
          }}
        >
          <Search className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Start voice call"
          title={
            isGroup
              ? "Group calling needs the SFU phase"
              : "Start a WebRTC voice call"
          }
          className="hidden text-muted-foreground sm:inline-flex"
          disabled={isGroup}
          onClick={() =>
            void startCall({
              conversationId: conversation.id,
              kind: "voice",
              peer: peer ?? { id: "" },
            })
          }
        >
          <Phone className="size-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Start video call"
          title={
            isGroup
              ? "Group calling needs the SFU phase"
              : "Start a WebRTC video call"
          }
          className="hidden text-muted-foreground sm:inline-flex"
          disabled={isGroup}
          onClick={() =>
            void startCall({
              conversationId: conversation.id,
              kind: "video",
              peer: peer ?? { id: "" },
            })
          }
        >
          <Video className="size-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Conversation options"
              className="text-muted-foreground"
            >
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onSelect={() =>
                void setMemberFlag({ muted: !conversation.muted })
              }
            >
              <BellOff className="size-4" />
              {conversation.muted ? "Unmute conversation" : "Mute conversation"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                void setMemberFlag({ archived: !conversation.archived })
              }
            >
              <Archive className="size-4" />
              {conversation.archived
                ? "Unarchive conversation"
                : "Archive conversation"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(conversation.id);
                setError("Conversation ID copied.");
              }}
            >
              Copy conversation ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {searchOpen && (
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search this conversation"
            className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setSearchOpen(false);
              setSearchTerm("");
            }}
            aria-label="Close search"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="chat-wallpaper thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <UserAvatar profile={avatarProfile} size="lg" />
            <p className="mt-2 text-sm font-bold">{title}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              No messages yet. Say hello — it arrives in real time.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1">
            {grouped.map((group) => (
              <div key={group.day} className="flex flex-col gap-1">
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-card/80 px-3 py-1 text-[0.65rem] font-semibold text-muted-foreground backdrop-blur">
                    {group.day}
                  </span>
                </div>
                {group.items.map((message, index) => {
                  const previous = group.items[index - 1];
                  const showAvatar = !previous || previous.sender_id !== message.sender_id;
                  const sender =
                    members.find((member) => member.user_id === message.sender_id)
                      ?.profile ?? null;
                  const receiptRows = receipts.filter(
                    (row) =>
                      row.message_id === message.id && row.user_id !== currentUserId,
                  );
                  const otherMembers = isGroup
                    ? Math.max(
                        members.filter((member) => member.user_id !== currentUserId)
                          .length,
                        1,
                      )
                    : 1;
                  const readRows = receiptRows.filter(
                    (row) => row.status === "read",
                  ).length;
                  const receipt =
                    receiptsEnabled && readRows >= otherMembers
                      ? "read"
                      : receiptRows.length >= otherMembers
                        ? "delivered"
                        : "sent";
                  const replyMessage = message.reply_to_id
                    ? messages.find((item) => item.id === message.reply_to_id) ?? null
                    : null;
                  const groupedReactions = Object.entries(
                    reactions
                      .filter((row) => row.message_id === message.id)
                      .reduce<Record<string, string[]>>((acc, row) => {
                        acc[row.emoji] = [...(acc[row.emoji] ?? []), row.user_id];
                        return acc;
                      }, {}),
                  ).map(([emoji, users]) => ({ emoji, users }));

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      own={message.sender_id === currentUserId}
                      sender={sender}
                      isGroup={isGroup}
                      showAvatar={showAvatar}
                      replyTo={replyMessage}
                      replySenderName={
                        replyMessage ? nameFor(replyMessage.sender_id) : null
                      }
                      receipt={receipt}
                      reactions={groupedReactions}
                      currentUserId={currentUserId}
                      canModerate={canModerate}
                      onReply={() => setReplyTo(message)}
                      onRetry={
                        message.status === "failed"
                          ? () => void deliver(message.id).catch(() => undefined)
                          : undefined
                      }
                      onForward={() => void openForward(message)}
                      onReact={(emoji) => void toggleReaction(message, emoji)}
                      onEdit={(body) => editMessage(message, body)}
                      onDeleteForMe={() => void deleteForMe(message)}
                      onDeleteForEveryone={() => void deleteForEveryone(message)}
                      onReport={() => void reportMessage(message)}
                      onCopy={() => void navigator.clipboard.writeText(message.body)}
                      onBlock={
                        isGroup || message.sender_id === currentUserId
                          ? undefined
                          : () => void blockSender(message.sender_id)
                      }
                    />
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} className="h-1" />
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <TypingIndicator
          names={typingNames}
          activity={activityLabel ? `${nameFor(primaryActivity[0])} is ${activityLabel.toLowerCase()}` : null}
          className="px-3 pb-1"
        />
      </div>

      <Composer
        conversationId={conversation.id}
        onSend={handleSend}
        onTyping={notifyTyping}
        onActivity={notifyActivity}
        replyTo={replyTo ? { message: replyTo, name: nameFor(replyTo.sender_id) } : null}
        onCancelReply={() => setReplyTo(null)}
        disabled={
          conversation.announce_only && !canModerate
            ? true
            : false
        }
        disabledReason="Only group admins can post in this group."
      />

      <Dialog
        open={Boolean(forwarding)}
        onOpenChange={(open) => {
          if (!open) setForwarding(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
          </DialogHeader>
          <div className="thin-scrollbar max-h-80 overflow-y-auto">
            {forwardTargets.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No other conversations available.
              </p>
            ) : (
              forwardTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  disabled={Boolean(forwardBusy)}
                  onClick={() => void forwardTo(target)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-secondary disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary">
                    {(target.title ?? "C").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {target.title || "Direct conversation"}
                    </span>
                    <span className="block truncate text-[0.65rem] text-muted-foreground">
                      {target.type === "group" ? "Group" : "Direct message"}
                    </span>
                  </span>
                  {forwardBusy === target.id && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
