import { PageHeader } from "@/components/app/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { searchPeople, startDirectConversation } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { Check, Loader2, Search, Share2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

export default function NewMessagePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from("contacts")
        .select("contact_id")
        .eq("owner_id", profile.id);
      const ids = (rows ?? []).map((row) => row.contact_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from("public_profiles")
          .select("*")
          .in("id", ids);
        if (active) setContacts((data ?? []) as Profile[]);
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const timeout = window.setTimeout(async () => {
      if (term.trim().length < 2) {
        setResults([]);
        return;
      }
      setResults(await searchPeople(term, profile.id));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [profile, term]);

  const visible = useMemo(
    () => (term.trim().length >= 2 ? results : contacts),
    [contacts, results, term],
  );

  const open = useCallback(
    async (person: Profile) => {
      if (!profile || opening) return;
      setOpening(person.id);
      setError(null);
      try {
        const conversationId = await startDirectConversation(person.id);
        navigate(`/app/chats?c=${conversationId}`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not open a conversation.",
        );
      } finally {
        setOpening(null);
      }
    },
    [navigate, opening, profile],
  );

  async function invite() {
    const url = window.location.origin;
    const text = "Join me on PINGO";
    if (navigator.share) {
      await navigator.share({ title: text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(`${text} — ${url}`);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="New message" back="/app/chats" />
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search name, @username or phone"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto pb-10">
        {error && (
          <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <p className="px-4 pt-5 pb-2 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {term.trim().length >= 2 ? "Search results" : "Your PINGO contacts"}
        </p>

        {loading || (opening && visible.length === 0) ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <UserPlus className="size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {term ? "No people found" : "No PINGO contacts yet"}
            </p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {term
                ? "Try the exact @username or a different name."
                : "Search for someone above, or invite a friend to PINGO."}
            </p>
            <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => void invite()}>
              <Share2 className="size-4" /> Invite to PINGO
            </Button>
          </div>
        ) : (
          visible.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => void open(person)}
              disabled={Boolean(opening)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/70 disabled:opacity-60"
            >
              <UserAvatar profile={person} size="md" showPresence />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.86rem] font-semibold">
                  {person.display_name || person.username}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  @{person.username}
                  {person.about ? ` · ${person.about}` : ""}
                </span>
              </span>
              {opening === person.id ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : contacts.some((item) => item.id === person.id) ? (
                <Check className="size-4 text-primary" />
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
