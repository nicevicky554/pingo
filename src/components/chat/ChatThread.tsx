import { Composer, type OutgoingMessage } from "@/components/chat/Composer";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  listHiddenMessageIds,
  listMessages,
  listReactions,
  listReceipts,
  markConversationRead,
  sendMessage,
  uploadChatAttachment,
} from "@/lib/chat";
import { dayLabel, lastSeenLabel, timeOf } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { freshPrivateChannel } from "@/lib/realtime";
import type {
  ConversationMember,
  ConversationSummary,
  Message,
  Profile,
} from "@/lib/types";
import { usePresence } from "@/providers/PresenceProvider";
import { useCall } from "@/providers/CallProvider";
import { useAuth } from "@/hooks/use-auth";
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

  const { online } = usePresence();
  const { startCall } = useCall();
  const { settings } = useAuth();
  const receiptsEnabled = settings?.read_receipts !== false;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const messagesRef = useRef<Message[]>([]);
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

  async function handleSend(
    outgoing: OutgoingMessage,
    onProgress: (percent: number) => void,
  ) {
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
      replyToId: replyTo?.id ?? null,
      disappearSeconds: conversation.disappear_seconds,
    });

    setMessages((current) =>
      current.some((message) => message.id === sent.id)
        ? current
        : [...current, sent],
    );
    messagesRef.current = [...messagesRef.current, sent];
    setReplyTo(null);
    void channelRef.current?.send({
      type: "broadcast",
      event: "stop_typing",
      payload: { user_id: currentUserId },
    });
    onChanged();
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
      await supabase.from("message_reactions").insert({
        message_id: message.id,
        user_id: currentUserId,
        emoji,
      });
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

        <UserAvatar profile={avatarProfile} size="md" showPresence={!isGroup} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9rem] font-semibold">{title}</p>
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
                  const receipt = !receiptsEnabled
                    ? "sent"
                    : receiptRows.some((row) => row.status === "read")
                      ? "read"
                      : receiptRows.length > 0
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
    </section>
  );
}
