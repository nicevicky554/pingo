import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createGroup, searchPeople, startDirectConversation } from "@/lib/chat";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Check, Loader2, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export function NewChatDialog({
  open,
  onOpenChange,
  currentUserId,
  onOpenConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onOpenConversation: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupDescription, setGroupDescription] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected([]);
      setGroupTitle("");
      setGroupDescription("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = window.setTimeout(async () => {
      const found = await searchPeople(term, currentUserId);
      setResults(found);
      setSearching(false);
    }, 280);
    return () => window.clearTimeout(timeout);
  }, [query, currentUserId, open]);

  async function openDirect(profile: Profile) {
    setBusyId(profile.id);
    setError(null);
    try {
      const conversationId = await startDirectConversation(profile.id);
      onOpenConversation(conversationId);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That conversation could not be started.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function submitGroup() {
    if (groupTitle.trim().length < 2 || selected.length === 0) return;
    setBusyId("group");
    setError(null);
    try {
      const conversationId = await createGroup(
        groupTitle.trim(),
        selected.map((profile) => profile.id),
        groupDescription.trim() || undefined,
      );
      onOpenConversation(conversationId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Group could not be created.");
    } finally {
      setBusyId(null);
    }
  }

  const canCreateGroup = groupTitle.trim().length >= 2 && selected.length > 0;
  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.id)),
    [selected],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Find someone by name or @username, or gather a group.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="direct">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="direct">Direct chat</TabsTrigger>
            <TabsTrigger value="group">New group</TabsTrigger>
          </TabsList>

          <TabsContent value="direct" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or @username"
                className="h-10 pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto">
              {searching && (
                <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </div>
              )}
              {!searching &&
                results.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => void openDirect(profile)}
                    disabled={busyId !== null}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <UserAvatar profile={profile} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {profile.display_name || "PINGO user"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{profile.username ?? "unknown"}
                      </span>
                    </span>
                    {busyId === profile.id && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                  </button>
                ))}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  No one found. Check the username, or invite them to PINGO.
                </p>
              )}
              {query.trim().length < 2 && (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Type at least two characters to search.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="group" className="mt-4 space-y-3">
            <Input
              value={groupTitle}
              onChange={(event) => setGroupTitle(event.target.value)}
              placeholder="Group name"
              maxLength={60}
              className="h-10"
            />
            <Textarea
              value={groupDescription}
              onChange={(event) => setGroupDescription(event.target.value)}
              placeholder="What is this group for? (optional)"
              rows={2}
              maxLength={240}
            />
            <div className="relative">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people to add"
                className="h-10 pl-9"
              />
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() =>
                      setSelected((items) =>
                        items.filter((item) => item.id !== profile.id),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary"
                  >
                    {profile.display_name || profile.username}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-48 space-y-1 overflow-y-auto">
              {results.map((profile) => {
                const isSelected = selectedIds.has(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() =>
                      setSelected((items) =>
                        isSelected
                          ? items.filter((item) => item.id !== profile.id)
                          : [...items, profile],
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent",
                      isSelected && "bg-accent/60",
                    )}
                  >
                    <UserAvatar profile={profile} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {profile.display_name || "PINGO user"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{profile.username ?? "unknown"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input",
                      )}
                    >
                      {isSelected && <Check className="size-3" />}
                    </span>
                  </button>
                );
              })}
              {query.trim().length < 2 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  Search to add members. You can add more after creating the group.
                </p>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!canCreateGroup || busyId !== null}
              onClick={() => void submitGroup()}
            >
              {busyId === "group" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UsersRound className="size-4" />
              )}
              Create group
            </Button>
          </TabsContent>
        </Tabs>

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
