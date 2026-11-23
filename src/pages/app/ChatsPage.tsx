import { ChatThread } from "@/components/chat/ChatThread";
import { CreateMenu } from "@/components/chat/CreateMenu";
import { NewChatDialog } from "@/components/chat/NewChatDialog";
import { PingoMark } from "@/components/Wordmark";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import { listConversations, listMembers, searchMessages } from "@/lib/chat";
import { watchChannel } from "@/lib/realtime";
import { supabase } from "@/lib/supabase";
import { chatListTime, previewOf } from "@/lib/format";
import type {
  Channel,
  ConversationMember,
  ConversationSummary,
  Profile,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BellOff,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  Radio,
  Search,
  SquarePen,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

type MemberWithProfile = ConversationMember & { profile: Profile | null };
type MessageHit = {
  id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  sender_id: string;
  kind: string;
};

const TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "personal", label: "Personal" },
  { id: "groups", label: "Groups" },
  { id: "channels", label: "Channels" },
  { id: "archived", label: "Archived" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ChatsPage() {
  const { profile, settings } = useAuth();
  const profileId = profile?.id;
  const receiptsEnabled = settings?.read_receipts !== false;
  const statusRings = useStatusRings();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [lastReceipts, setLastReceipts] = useState<Record<string, "delivered" | "read">>(
    {},
  );
  const [members, setMembers] = useState<Record<string, MemberWithProfile[]>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [filter, setFilter] = useState("");
  const [hits, setHits] = useState<MessageHit[]>([]);
  const [searching, setSearching] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationParam = searchParams.get("c");

  const load = useCallback(async () => {
    if (!profileId) return;
    try {
      const list = await listConversations(profileId);
      setConversations(list);

      const lastIds = list
        .map((item) => item.last_message?.id)
        .filter((id): id is string => Boolean(id));
      if (lastIds.length > 0) {
        const { data: receiptRows } = await supabase
          .from("message_receipts")
          .select("message_id,status")
          .in("message_id", lastIds);
        const best: Record<string, "delivered" | "read"> = {};
        for (const row of receiptRows ?? []) {
          const receipt = row as { message_id: string; status: string };
          if (receipt.status === "read") best[receipt.message_id] = "read";
          else if (!best[receipt.message_id]) best[receipt.message_id] = "delivered";
        }
        setLastReceipts(best);
      } else {
        setLastReceipts({});
      }
      const { members: rows } = await listMembers(list.map((item) => item.id));
      const grouped: Record<string, MemberWithProfile[]> = {};
      for (const row of rows) {
        grouped[row.conversation_id] = [
          ...(grouped[row.conversation_id] ?? []),
          row as MemberWithProfile,
        ];
      }
      setMembers(grouped);

      const { data: follows } = await supabase
        .from("channel_members")
        .select("channel:channels(*)")
        .eq("user_id", profileId);
      setChannels(
        (follows ?? [])
          .map((row) => (row as unknown as { channel: Channel | null }).channel)
          .filter((channel): channel is Channel => Boolean(channel)),
      );
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Conversations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (conversationParam) setActiveId(conversationParam);
  }, [conversationParam]);

  useEffect(() => {
    if (!profileId) return;
    const channel = watchChannel("inbox-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(() => void load(), 300);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members" },
        () => {
          if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
          refreshTimer.current = window.setTimeout(() => void load(), 300);
        },
      )
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[PINGO] inbox subscription:", error);
        }
      });

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, profileId]);

  useEffect(() => {
    const term = filter.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      setHits((await searchMessages(term)) as MessageHit[]);
      setSearching(false);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filter]);

  const active = conversations.find((item) => item.id === activeId) ?? null;

  const peerFor = useCallback(
    (conversation: ConversationSummary) =>
      (members[conversation.id] ?? []).find(
        (member) => member.user_id !== profileId,
      )?.profile ?? null,
    [members, profileId],
  );

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        if (tab === "channels") return false;
        if (tab === "archived") return conversation.archived;
        if (conversation.archived) return false;
        if (tab === "unread") return conversation.unread > 0;
        if (tab === "personal") return conversation.type === "direct";
        if (tab === "groups") return conversation.type === "group";
        return true;
      })
      .filter((conversation) => {
        if (!term) return true;
        const peer = peerFor(conversation);
        return (
          (conversation.title ?? "").toLowerCase().includes(term) ||
          (peer?.display_name ?? "").toLowerCase().includes(term) ||
          (peer?.username ?? "").toLowerCase().includes(term)
        );
      });
  }, [conversations, filter, peerFor, tab]);

  if (!profile) return null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border bg-card md:w-[360px] md:shrink-0",
          activeId && "hidden md:flex",
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <h1 className="flex-1 text-[1.05rem] font-semibold tracking-[-0.01em]">
            Chats
          </h1>
          <Link
            to="/app/search"
            aria-label="Search PINGO"
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Search className="size-[20px]" />
          </Link>
          <CreateMenu
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-9 text-muted-foreground"
                aria-label="New conversation"
              >
                <SquarePen className="size-[20px]" />
              </Button>
            }
          />
        </header>

        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search"
              className="h-9 rounded-md border-transparent bg-secondary pl-8 text-[0.82rem] focus-visible:border-input"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-[0.72rem] font-medium transition-colors",
                tab === item.id
                  ? "bg-accent text-primary"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="border-y border-border bg-destructive/10 px-4 py-2 text-[0.7rem] text-destructive">
            {error}
          </p>
        )}

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 &&
            !filter &&
            !(tab === "channels" && channels.length > 0) ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <MessageSquare className="size-5" />
              </span>
              <p className="mt-4 text-sm font-medium">
                {tab === "archived"
                  ? "No archived chats"
                  : tab === "channels"
                    ? "No followed channels"
                    : tab === "unread"
                      ? "You're all caught up"
                      : "No conversations yet"}
              </p>
              <p className="mt-1 max-w-[220px] text-xs leading-5 text-muted-foreground">
                {tab === "archived"
                  ? "Archived conversations will appear here."
                  : tab === "channels"
                    ? "Follow a channel from Updates to see it here."
                    : "Search for someone by @username or start a group."}
              </p>
              {tab !== "archived" &&
                tab !== "unread" &&
                tab !== "channels" && (
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setNewChatOpen(true)}
                >
                  <Plus className="size-4" /> New chat
                </Button>
              )}
            </div>
          ) : (
            <>
              {visible.map((conversation) => {
                const peer = peerFor(conversation);
                const isGroup = conversation.type === "group";
                const title =
                  conversation.title || peer?.display_name || "Conversation";
                const avatar = isGroup
                  ? {
                      id: conversation.id,
                      display_name: title,
                      avatar_path: null,
                      public_avatar_url: conversation.avatar_url,
                    }
                  : peer;
                const last = conversation.last_message;
                const senderName = last
                  ? last.sender_id === profile.id
                    ? ""
                    : isGroup
                      ? `${(members[conversation.id] ?? []).find((member) => member.user_id === last.sender_id)?.profile?.display_name?.split(" ")[0] ?? ""}: `
                      : ""
                  : "";

                const ring = !isGroup && peer ? statusRings[peer.id] ?? null : null;

                return (
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveId(conversation.id);
                      setSearchParams({ c: conversation.id }, { replace: true });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveId(conversation.id);
                        setSearchParams({ c: conversation.id }, { replace: true });
                      }
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary/70",
                      activeId === conversation.id && "bg-secondary",
                    )}
                  >
                    <button
                      type="button"
                      aria-label={
                        ring
                          ? `View ${title}'s status`
                          : `Open ${title}'s profile`
                      }
                      className="shrink-0 rounded-full"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!peer) return;
                        navigate(
                          ring
                            ? `/app/updates?statusUser=${peer.id}`
                            : `/app/profile/${peer.id}`,
                        );
                      }}
                    >
                      <UserAvatar
                        profile={avatar}
                        size="md"
                        showPresence={!isGroup}
                        ring={ring}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold">
                          {title}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 text-[0.65rem]",
                            conversation.unread > 0
                              ? "font-medium text-primary"
                              : "text-muted-foreground",
                          )}
                        >
                          {chatListTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {conversation.pinned && (
                          <Pin className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        {last?.sender_id === profile.id &&
                          (lastReceipts[last.id] === "read" && receiptsEnabled ? (
                            <CheckCheck className="size-3.5 shrink-0 text-primary" />
                          ) : lastReceipts[last.id] ? (
                            <CheckCheck className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <Check className="size-3.5 shrink-0 text-muted-foreground" />
                          ))}
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-[0.78rem]",
                            conversation.unread > 0
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {last
                            ? `${senderName}${previewOf(last.body, last.kind)}`
                            : "No messages yet"}
                        </p>
                        {conversation.muted && (
                          <BellOff className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        {conversation.unread > 0 && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold text-primary-foreground">
                            {conversation.unread > 99 ? "99+" : conversation.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {(tab === "all" || tab === "channels") &&
                !filter &&
                channels.length > 0 && (
                <div className="mt-2">
                  <p className="px-4 pt-2 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Channels
                  </p>
                  {channels.map((channel) => (
                    <Link
                      key={channel.id}
                      to={`/app/channels/${channel.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/70"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <Radio className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.86rem] font-semibold">
                          {channel.name}
                        </span>
                        <span className="block truncate text-[0.78rem] text-muted-foreground">
                          @{channel.username}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              {filter.trim().length >= 2 && (
                <div className="mt-2 border-t border-border">
                  <p className="px-4 pt-3 pb-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Messages
                  </p>
                  {searching ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : hits.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">
                      No messages match.
                    </p>
                  ) : (
                    hits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => setActiveId(hit.conversation_id)}
                        className="block w-full px-4 py-2.5 text-left hover:bg-secondary"
                      >
                        <p className="truncate text-xs font-medium">{hit.body}</p>
                        <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                          {chatListTime(hit.created_at)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <div
        className={cn(
          "min-w-0 flex-1 flex-col",
          activeId ? "flex" : "hidden md:flex",
        )}
      >
        {active ? (
          <ChatThread
            key={active.id}
            conversation={active}
            members={members[active.id] ?? []}
            currentUserId={profile.id}
            currentProfile={profile}
            onBack={() => {
              setActiveId(null);
              setSearchParams({}, { replace: true });
            }}
            onChanged={() => void load()}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center bg-[var(--chat-bg)] px-8 text-center">
            <PingoMark className="size-14" />
            <h2 className="mt-5 text-lg font-semibold tracking-[-0.02em]">
              PINGO Web
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Select a conversation to start messaging. Your messages stay in
              sync across every signed-in device.
            </p>
          </div>
        )}
      </div>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        currentUserId={profile.id}
        onOpenConversation={(id) => {
          setActiveId(id);
          setSearchParams({ c: id }, { replace: true });
          void load();
        }}
      />
    </div>
  );
}
