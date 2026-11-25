import { PageHeader } from "@/components/app/PageHeader";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/providers/BrandingProvider";
import {
  leaveGroup,
  listMembers,
  searchPeople,
  signedMediaUrl,
} from "@/lib/chat";
import { supabase } from "@/lib/supabase";
import type { ConversationMember, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  Camera,
  FileText,
  Hash,
  Image as ImageIcon,
  Link2,
  Loader2,
  LogOut,
  Megaphone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

type Group = {
  id: string;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  announce_only: boolean;
  created_by: string | null;
};

type Member = ConversationMember & { profile: Profile | null };
type Tab = "members" | "media" | "settings";
type SharedMedia = { id: string; url: string; kind: "image" | "video" };
type SharedDoc = { id: string; name: string; url: string | null };
type SharedLink = { id: string; url: string };

export default function GroupInfoPage() {
  const { conversationId } = useParams();
  const { profile } = useAuth();
  const { assets } = useBranding();
  const navigate = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<string>("member");
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicSaving, setTopicSaving] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("members");
  const [media, setMedia] = useState<SharedMedia[]>([]);
  const [docs, setDocs] = useState<SharedDoc[]>([]);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!conversationId || !profile) return;
    setLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("id,title,description,avatar_url,announce_only,created_by")
      .eq("id", conversationId)
      .maybeSingle();
    const conversation = (data ?? null) as Group | null;
    setGroup(conversation);
    setTitle(conversation?.title ?? "");
    setDescription(conversation?.description ?? "");

    const { members: rows } = await listMembers([conversationId]);
    setMembers(rows);
    const mine = rows.find((member) => member.user_id === profile.id);
    setRole(mine?.role ?? "member");
    if (mine) {
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("muted")
        .eq("conversation_id", conversationId)
        .eq("user_id", profile.id)
        .maybeSingle();
      setMuted(Boolean((membership as { muted?: boolean } | null)?.muted));
    }
    const { data: topicRows } = await supabase
      .from("conversation_topics")
      .select("id,title")
      .eq("conversation_id", conversationId)
      .order("created_at");
    setTopics((topicRows ?? []) as { id: string; title: string }[]);
    setLoading(false);
  }, [conversationId, profile]);

  useEffect(() => {
    void load();
  }, [load]);

  // Media, links and documents are the actual messages in this group; nothing
  // is invented or stored in a second place.
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    setMediaLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id,body,kind,attachment_path,attachment_name,created_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = (data ?? []) as {
        id: string;
        body: string;
        kind: string;
        attachment_path: string | null;
        attachment_name: string | null;
      }[];
      const mediaRows: SharedMedia[] = [];
      const docRows: SharedDoc[] = [];
      const linkRows: SharedLink[] = [];
      for (const row of rows) {
        for (const match of row.body?.match(/https?:\/\/[^\s<]+/g) ?? []) {
          linkRows.push({ id: `${row.id}-${match}`, url: match });
        }
        if (!row.attachment_path) continue;
        if (row.kind === "image" || row.kind === "video") {
          const url = await signedMediaUrl(row.attachment_path);
          if (url) mediaRows.push({ id: row.id, url, kind: row.kind });
        } else if (row.kind === "file" || row.kind === "voice") {
          const url = await signedMediaUrl(row.attachment_path);
          docRows.push({
            id: row.id,
            name:
              row.attachment_name ??
              row.attachment_path.split("/").pop() ??
              "Attachment",
            url,
          });
        }
      }
      if (!active) return;
      setMedia(mediaRows);
      setDocs(docRows);
      setLinks(linkRows);
      setMediaLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [conversationId]);

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

  async function saveDetails() {
    if (!conversationId || saving) return;
    setSaving(true);
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ title: title.trim(), description: description.trim() || null })
      .eq("id", conversationId);
    if (updateError) setError(updateError.message);
    else {
      setEditing(false);
      setGroup((current) =>
        current
          ? { ...current, title: title.trim(), description: description.trim() || null }
          : current,
      );
    }
    setSaving(false);
  }

  async function changePhoto(file: File) {
    if (!conversationId || !profile) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${profile.id}/groups/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ avatar_url: url })
      .eq("id", conversationId);
    if (updateError) setError(updateError.message);
    else setGroup((current) => (current ? { ...current, avatar_url: url } : current));
  }

  async function toggleMute() {
    if (!conversationId || !profile) return;
    const next = !muted;
    await supabase
      .from("conversation_members")
      .update({ muted: next })
      .eq("conversation_id", conversationId)
      .eq("user_id", profile.id);
    setMuted(next);
  }

  async function addMember(person: Profile) {
    if (!conversationId) return;
    const { error: insertError } = await supabase
      .from("conversation_members")
      .insert({ conversation_id: conversationId, user_id: person.id });
    if (insertError) setError(insertError.message);
    else {
      setAdding(false);
      setTerm("");
      setResults([]);
      await load();
    }
  }

  async function removeMember(userId: string) {
    if (!conversationId || roleBusy) return;
    setRoleBusy(userId);
    const { error: deleteError } = await supabase
      .from("conversation_members")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (deleteError) setError(deleteError.message);
    else await load();
    setRoleBusy(null);
  }

  async function createTopic() {
    if (!conversationId || !profile || !topicTitle.trim() || topicSaving) return;
    setTopicSaving(true);
    const { data, error: insertError } = await supabase
      .from("conversation_topics")
      .insert({
        conversation_id: conversationId,
        title: topicTitle.trim(),
        created_by: profile.id,
      })
      .select("id,title")
      .single();
    if (insertError) setError(insertError.message);
    else if (data) {
      setTopics((current) => [...current, data as { id: string; title: string }]);
      setTopicTitle("");
    }
    setTopicSaving(false);
  }

  async function deleteTopic(topicId: string) {
    const { error: deleteError } = await supabase
      .from("conversation_topics")
      .delete()
      .eq("id", topicId);
    if (deleteError) setError(deleteError.message);
    else setTopics((current) => current.filter((topic) => topic.id !== topicId));
  }

  async function setMemberRole(userId: string, next: "admin" | "member") {
    if (!conversationId) return;
    setRoleBusy(userId);
    const { error: updateError } = await supabase
      .from("conversation_members")
      .update({ role: next })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    if (updateError) setError(updateError.message);
    else await load();
    setRoleBusy(null);
  }

  async function toggleAnnounceOnly() {
    if (!conversationId || !group) return;
    const next = !group.announce_only;
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ announce_only: next })
      .eq("id", conversationId);
    if (updateError) setError(updateError.message);
    else setGroup((current) => (current ? { ...current, announce_only: next } : current));
  }

  async function leave() {
    if (!conversationId || !profile) return;
    try {
      await leaveGroup(conversationId, profile.id);
      navigate("/app/chats", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave the group.");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium">Group unavailable</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/app/chats")}>
          Back to chats
        </Button>
      </div>
    );
  }

  const canManage = role === "owner" || role === "admin";
  const inviteLink = `${window.location.origin}/app/chats?c=${group.id}`;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader
        title="Group info"
        back={() => navigate(`/app/chats?c=${group.id}`)}
      />

      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            disabled={!canManage}
            onClick={() => avatarInput.current?.click()}
            className="relative flex size-24 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border"
            aria-label={canManage ? "Change group photo" : "Group photo"}
          >
            {group.avatar_url || assets.default_group_url ? (
              <img
                src={group.avatar_url ?? assets.default_group_url}
                alt="Group"
                className="size-full object-cover"
              />
            ) : (
              <UsersRound className="size-9" />
            )}
            {canManage && (
              <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Camera className="size-3.5" />
              </span>
            )}
          </button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void changePhoto(file);
            }}
          />

          {editing ? (
            <div className="mt-4 w-full max-w-md text-left">
              <label className="text-xs font-medium text-muted-foreground">Group name</label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                className="mt-1.5 h-10"
              />
              <label className="mt-3 block text-xs font-medium text-muted-foreground">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                maxLength={300}
                className="mt-1.5 resize-none"
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void saveDetails()} disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em]">
                {group.title || "Group"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Group · {members.length} member{members.length === 1 ? "" : "s"}
                {group.announce_only ? " · only admins can post" : ""}
              </p>
              {group.description && (
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {group.description}
                </p>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setEditing(true)}
                >
                  Edit group details
                </Button>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-1 border-b border-border">
          {(
            [
              ["members", `Members (${members.length})`],
              ["media", "Media"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "-mb-px flex-1 border-b-2 px-2 py-2 text-xs font-medium",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "members" && (
          <div className="mt-3">
            {canManage && (
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => setAdding((open) => !open)}
              >
                <UserPlus className="size-4" /> Add members
              </Button>
            )}

            {adding && (
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 rounded-md bg-secondary px-2.5">
                  <Search className="size-4 text-muted-foreground" />
                  <input
                    autoFocus
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Search people"
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto">
                  {results
                    .filter(
                      (person) =>
                        !members.some((member) => member.user_id === person.id),
                    )
                    .map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => void addMember(person)}
                        className="flex w-full items-center gap-2.5 rounded-md px-1 py-2 text-left hover:bg-secondary"
                      >
                        <UserAvatar profile={person} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {person.display_name || person.username}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{person.username}
                          </span>
                        </span>
                      </button>
                    ))}
                  {term.trim().length >= 2 && results.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      No people found.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <UserAvatar profile={member.profile} size="sm" showPresence />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.profile?.display_name || "PINGO user"}
                      {member.user_id === profile?.id ? " (you)" : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{member.profile?.username ?? "unknown"}
                    </p>
                  </div>
                  {canManage &&
                    member.role !== "owner" &&
                    member.user_id !== profile?.id && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={roleBusy === member.user_id}
                          onClick={() =>
                            void setMemberRole(
                              member.user_id,
                              member.role === "admin" ? "member" : "admin",
                            )
                          }
                          className="flex items-center gap-1 text-[0.62rem] font-medium text-primary disabled:opacity-50"
                        >
                          <ShieldCheck className="size-3" />
                          {member.role === "admin" ? "Demote" : "Make admin"}
                        </button>
                        <button
                          type="button"
                          disabled={roleBusy === member.user_id}
                          onClick={() => void removeMember(member.user_id)}
                          aria-label={`Remove ${member.profile?.display_name ?? "member"}`}
                          className="ml-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.58rem] font-medium capitalize",
                      member.role === "owner"
                        ? "bg-primary text-primary-foreground"
                        : member.role === "admin"
                          ? "bg-accent text-primary"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {member.role === "owner"
                      ? "Owner"
                      : member.role === "admin"
                        ? "Administrator"
                        : "Member"}
                  </span>
                </div>
              ))}
            </div>

            <h3 className="mt-5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Topics
            </h3>
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
              {topics.length === 0 && (
                <p className="px-4 py-3 text-xs text-muted-foreground">
                  No topics yet. Topics keep longer group conversations organised.
                </p>
              )}
              {topics.map((topic) => (
                <div
                  key={topic.id}
                  className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-b-0"
                >
                  <Hash className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void deleteTopic(topic.id)}
                      aria-label={`Remove ${topic.title}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {canManage && (
                <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
                  <Input
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    placeholder="New topic name"
                    maxLength={60}
                    className="h-9"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createTopic();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => void createTopic()}
                    disabled={!topicTitle.trim() || topicSaving}
                  >
                    {topicSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "media" && (
          <div className="mt-3 space-y-5">
            {mediaLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div>
                  <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <ImageIcon className="size-3.5" /> Media
                  </p>
                  {media.length === 0 ? (
                    <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                      No photos or videos in this group yet.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-3 gap-1">
                      {media.map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="relative aspect-square overflow-hidden rounded-md bg-secondary"
                        >
                          {item.kind === "image" ? (
                            <img
                              src={item.url}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-[0.6rem] text-muted-foreground">
                              <Video className="size-4" />
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Link2 className="size-3.5" /> Links
                  </p>
                  {links.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">No links yet.</p>
                  ) : (
                    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                      {links.map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="block truncate border-b border-border px-3 py-2 text-xs text-primary last:border-b-0"
                        >
                          {link.url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <FileText className="size-3.5" /> Documents
                  </p>
                  {docs.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No documents yet.
                    </p>
                  ) : (
                    <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                      {docs.map((doc) => (
                        <a
                          key={doc.id}
                          href={doc.url ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"
                        >
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="mt-3 space-y-3">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => void toggleMute()}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
              >
                {muted ? (
                  <BellOff className="size-4 text-muted-foreground" />
                ) : (
                  <Bell className="size-4 text-primary" />
                )}
                <span className="flex-1">
                  {muted ? "Unmute notifications" : "Mute notifications"}
                </span>
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => void toggleAnnounceOnly()}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
                >
                  <Megaphone className="size-4 text-primary" />
                  <span className="flex-1">
                    {group.announce_only
                      ? "Allow all members to post"
                      : "Restrict posting to admins"}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink);
                  setError("Group link copied.");
                }}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
              >
                <Link2 className="size-4 text-muted-foreground" />
                <span className="flex-1">Copy group invite link</span>
              </button>
              <button
                type="button"
                onClick={() => void leave()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-destructive/5"
              >
                <LogOut className="size-4" />
                <span className="flex-1">Exit group</span>
              </button>
            </div>

            <div className="rounded-lg border border-border bg-card px-4 py-3 text-[0.65rem] leading-5 text-muted-foreground">
              <p className="font-medium text-foreground">Group permissions</p>
              <p className="mt-1">
                {group.announce_only
                  ? "Only owners and administrators can send messages."
                  : "All members can send messages. Administrators can still manage members, topics and group details."}
              </p>
              <p className="mt-1">
                Administrative actions are checked by the database, not only by
                this screen.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
