import { ChatThread } from "@/components/chat/ChatThread";
import { NewChatDialog } from "@/components/chat/NewChatDialog";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { listConversations, listMembers, searchMessages } from "@/lib/chat";
import { chatListTime, previewOf } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type {
  ConversationMember,
  ConversationSummary,
  Profile,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  BellOff,
  Loader2,
  MessageCircle,
  Pin,
  Plus,
  Search,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";

type MemberWithProfile = ConversationMember & { profile: Profile | null };

type MessageHit = {
  id: string;
  conversation_id: string;
  body: string;
  created_at: string;
  sender_id: string;
  kind: string;
};

export default function ChatsPage() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [members, setMembers] = useState<Record<string, MemberWithProfile[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState("");
  const [hits, setHits] = useState<MessageHit[]>([]);
  const [searching, setSearching] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const [searchParams] = useSearchParams();
  const conversationParam = searchParams.get("c");

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const list = await listConversations(profile.id);
      setConversations(list);
      const { members: rows } = await listMembers(list.map((item) => item.id));
      const grouped: Record<string, MemberWithProfile[]> = {};
      for (const row of rows) {
        grouped[row.conversation_id] = [
          ...(grouped[row.conversation_id] ?? []),
          row as MemberWithProfile,
        ];
      }
      setMembers(grouped);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Conversations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (conversationParam) setActiveId(conversationParam);
  }, [conversationParam]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("inbox-watch")
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
      .subscribe();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load, profile]);

  // Global message search (RLS limits results to conversations you belong to).
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
        (member) => member.user_id !== profile?.id,
      )?.profile ?? null,
    [members, profile?.id],
  );

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return conversations
      .filter((conversation) =>
        showArchived ? conversation.archived : !conversation.archived,
      )
      .filter((conversation) => {
        if (!term) return true;
        const peer = peerFor(conversation);
        return (
          (conversation.title ?? "").toLowerCase().includes(term) ||
          (peer?.display_name ?? "").toLowerCase().includes(term) ||
          (peer?.username ?? "").toLowerCase().includes(term)
        );
      });
  }, [conversations, filter, peerFor, showArchived]);

  if (!profile) return null;

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "flex w-full min-w-0 flex-col border-r border-border bg-card md:w-[350px] md:shrink-0",
          activeId && "hidden md:flex",
        )}
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageCircle className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold">Chats</h1>
              <p className="truncate text-[0.68rem] text-muted-foreground">
                {conversations.filter((item) => !item.archived).length} conversations
              </p>
            </div>
          </div>
          <NotificationsMenu compact />
          <Button
            size="icon"
            className="rounded-full"
            onClick={() => setNewChatOpen(true)}
            aria-label="Start a new conversation"
          >
            <Plus className="size-5" />
          </Button>
        </header>

        <div className="border-b border-border px-3 py-2.5">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search chats and messages"
              className="h-9 rounded-lg bg-muted/60 pl-9"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="border-b border-border bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : visible.length === 0 && !filter ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="size-6" />
              </span>
              <p className="mt-4 text-sm font-bold">No conversations yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Start a chat by finding someone's @username, or create a group.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setNewChatOpen(true)}
              >
                <Plus className="size-4" /> New chat
              </Button>
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
                const senderName = conversation.last_message
                  ? conversation.last_message.sender_id === profile.id
                    ? "You: "
                    : isGroup
                      ? `${(members[conversation.id] ?? []).find((member) => member.user_id === conversation.last_message?.sender_id)?.profile?.display_name?.split(" ")[0] ?? ""}: `
                      : ""
                  : "";

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border/60 px-3.5 py-3 text-left transition-colors hover:bg-accent/50",
                      activeId === conversation.id && "bg-accent/60",
                    )}
                  >
                    <UserAvatar
                      profile={avatar}
                      size="md"
                      showPresence={!isGroup}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-bold">
                          {title}
                        </p>
                        <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                          {chatListTime(conversation.last_message_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {conversation.pinned && (
                          <Pin className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        <p
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs",
                            conversation.unread > 0
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {conversation.last_message
                            ? `${senderName}${previewOf(
                                conversation.last_message.body,
                                conversation.last_message.kind,
                              )}`
                            : "No messages yet"}
                        </p>
                        {conversation.muted && (
                          <BellOff className="size-3 shrink-0 text-muted-foreground" />
                        )}
                        {conversation.unread > 0 && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.62rem] font-bold text-primary-foreground">
                            {conversation.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}

              {conversations.some((conversation) => conversation.archived) && (
                <div className="border-t border-border px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowArchived((value) => !value)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {showArchived
                      ? "← Back to active chats"
                      : `Show archived (${conversations.filter((c) => c.archived).length})`}
                  </button>
                </div>
              )}

              {filter.trim().length >= 2 && (
                <div className="border-t border-border">
                  <p className="px-4 pt-3 pb-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
                        className="block w-full border-b border-border/60 px-4 py-2.5 text-left hover:bg-accent/50"
                      >
                        <p className="truncate text-xs font-semibold">{hit.body}</p>
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
            onBack={() => setActiveId(null)}
            onChanged={() => void load()}
          />
        ) : (
          <div className="dot-grid flex h-full flex-col items-center justify-center px-8 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card text-primary">
              <MessageCircle className="size-7" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold">
              Pick a conversation
            </h2>
            <p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">
              Select a chat to keep talking, or start a new one with a username.
            </p>
            <Button className="mt-5" onClick={() => setNewChatOpen(true)}>
              <UsersRound className="size-4" /> New conversation
            </Button>
          </div>
        )}
      </div>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        currentUserId={profile.id}
        onOpenConversation={(id) => {
          setActiveId(id);
          void load();
        }}
      />
    </div>
  );
}
