import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { listConversations, listMembers } from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { Community, ConversationSummary } from "@/lib/types";
import {
  Check,
  Loader2,
  Plus,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CommunityRow = Community & { member_count: number; is_member: boolean };

export default function CommunitiesPage() {
  const { profile } = useAuth();
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [active, setActive] = useState<CommunityRow | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("communities")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Community[];

    const withCounts: CommunityRow[] = [];
    for (const community of rows) {
      const { count } = await supabase
        .from("community_members")
        .select("*", { count: "exact", head: true })
        .eq("community_id", community.id);
      const { data: mine } = await supabase
        .from("community_members")
        .select("user_id")
        .eq("community_id", community.id)
        .eq("user_id", profile.id)
        .maybeSingle();
      withCounts.push({
        ...community,
        member_count: count ?? 0,
        is_member: Boolean(mine),
      });
    }
    setCommunities(withCounts);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMembership(community: CommunityRow) {
    if (!profile) return;
    if (community.is_member) {
      await supabase
        .from("community_members")
        .delete()
        .eq("community_id", community.id)
        .eq("user_id", profile.id);
    } else {
      await supabase
        .from("community_members")
        .insert({ community_id: community.id, user_id: profile.id });
    }
    void load();
  }

  if (!profile) return null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.05rem] font-semibold tracking-[-0.01em]">Communities</h1>
          <p className="text-[0.68rem] text-muted-foreground">
            Groups that belong together
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New
        </Button>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : communities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UsersRound className="size-6" />
            </span>
            <p className="mt-4 text-sm font-bold">No communities yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Communities gather related groups under one name and one set of
              administrators.
            </p>
            <Button className="mt-4" size="sm" onClick={() => setCreateOpen(true)}>
              Create a community
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {communities.map((community) => (
              <div
                key={community.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UsersRound className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{community.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {community.member_count} member
                      {community.member_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {community.description && (
                  <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {community.description}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={community.is_member ? "ghost" : "outline"}
                    onClick={() => void toggleMembership(community)}
                  >
                    {community.is_member ? (
                      <>
                        <Check className="size-3.5" /> Joined
                      </>
                    ) : (
                      "Join"
                    )}
                  </Button>
                  {community.owner_id === profile.id && (
                    <Button size="sm" variant="ghost" onClick={() => setActive(community)}>
                      Manage groups
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateCommunityDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={profile.id}
        onCreated={() => {
          setCreateOpen(false);
          void load();
        }}
      />

      {active && (
        <ManageCommunityDialog
          community={active}
          userId={profile.id}
          onClose={() => {
            setActive(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CreateCommunityDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (name.trim().length < 2) {
      setError("Give the community a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("communities")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        owner_id: userId,
      })
      .select("id")
      .single();
    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }
    await supabase
      .from("community_members")
      .insert({ community_id: data.id, user_id: userId, role: "owner" });
    setSaving(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a community</DialogTitle>
          <DialogDescription>
            You become its first administrator.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Community name"
          maxLength={60}
        />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What brings this community together?"
          rows={3}
          maxLength={240}
        />
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManageCommunityDialog({
  community,
  userId,
  onClose,
}: {
  community: CommunityRow;
  userId: string;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<ConversationSummary[]>([]);
  const [attached, setAttached] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const conversations = await listConversations(userId);
    setGroups(conversations.filter((item) => item.type === "group"));
    const { data } = await supabase
      .from("community_groups")
      .select("conversation_id")
      .eq("community_id", community.id);
    setAttached(new Set((data ?? []).map((row) => row.conversation_id)));
    setLoading(false);
  }, [community.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(conversationId: string) {
    if (attached.has(conversationId)) {
      await supabase
        .from("community_groups")
        .delete()
        .eq("community_id", community.id)
        .eq("conversation_id", conversationId);
    } else {
      await supabase.from("community_groups").insert({
        community_id: community.id,
        conversation_id: conversationId,
      });
    }
    await load();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{community.name}</DialogTitle>
          <DialogDescription>
            Attach groups you administer to this community.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You have no groups yet. Create one from Chats first.
          </p>
        ) : (
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {group.title ?? "Group"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {group.role === "owner" || group.role === "admin"
                      ? "You admin this group"
                      : "Member"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={attached.has(group.id) ? "ghost" : "outline"}
                  onClick={() => void toggle(group.id)}
                >
                  {attached.has(group.id) ? "Attached" : "Attach"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
