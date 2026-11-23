import { PageHeader } from "@/components/app/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import {
  searchMessages,
  searchPeople,
  startDirectConversation,
} from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { Channel, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Hash, Loader2, MessageSquare, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

type Tab = "people" | "messages" | "channels";
type MessageHit = {
  id: string;
  conversation_id: string;
  body: string;
  created_at: string;
};

export default function SearchPage() {
  const { profile } = useAuth();
  const statusRings = useStatusRings();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [people, setPeople] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<MessageHit[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const query = term.trim();
    if (query.length < 2) {
      setPeople([]);
      setMessages([]);
      setChannels([]);
      return;
    }
    setLoading(true);
    const timeout = window.setTimeout(async () => {
      const [nextPeople, nextMessages, channelResult] = await Promise.all([
        searchPeople(query, profile.id),
        searchMessages(query),
        supabase
          .from("channels")
          .select("*")
          .eq("is_public", true)
          .or(`name.ilike.%${query}%,username.ilike.%${query}%`)
          .limit(15),
      ]);
      setPeople(nextPeople);
      setMessages(nextMessages as MessageHit[]);
      setChannels((channelResult.data ?? []) as Channel[]);
      setLoading(false);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [profile, term]);

  const counts = useMemo(
    () => ({
      people: people.length,
      messages: messages.length,
      channels: channels.length,
    }),
    [channels.length, messages.length, people.length],
  );

  async function openPerson(person: Profile) {
    try {
      const conversationId = await startDirectConversation(person.id);
      navigate(`/app/chats?c=${conversationId}`);
    } catch {
      // The profile page still lets the user retry.
      navigate(`/app/profile/${person.id}`);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="Search" back="/app/chats" />
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="People, messages, channels"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex gap-1 px-3 pt-3">
        {(
          [
            ["people", "People", Users],
            ["messages", "Messages", MessageSquare],
            ["channels", "Channels", Hash],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
              tab === id
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <Icon className="size-3.5" /> {label}
            {counts[id] > 0 && <span className="text-[0.6rem] opacity-70">{counts[id]}</span>}
          </button>
        ))}
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pb-10">
        {term.trim().length < 2 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <Search className="size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Search PINGO</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              Find people by name or @username, search your messages, or discover
              public channels.
            </p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "people" ? (
          people.length === 0 ? (
            <Empty label="No people found" />
          ) : (
            people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => void openPerson(person)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/70"
              >
                <UserAvatar
                  profile={person}
                  size="md"
                  showPresence
                  ring={statusRings[person.id] ?? null}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.86rem] font-semibold">
                    {person.display_name || person.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{person.username}
                  </span>
                </span>
              </button>
            ))
          )
        ) : tab === "messages" ? (
          messages.length === 0 ? (
            <Empty label="No messages found" />
          ) : (
            messages.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => navigate(`/app/chats?c=${message.conversation_id}`)}
                className="block w-full px-4 py-3 text-left hover:bg-secondary/70"
              >
                <p className="line-clamp-2 text-sm">{message.body}</p>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {new Date(message.created_at).toLocaleString()}
                </p>
              </button>
            ))
          )
        ) : channels.length === 0 ? (
          <Empty label="No public channels found" />
        ) : (
          channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => navigate(`/app/channels/${channel.id}`)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/70"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Hash className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.86rem] font-semibold">
                  {channel.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{channel.username}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="px-6 py-12 text-center text-xs text-muted-foreground">{label}</p>
  );
}
