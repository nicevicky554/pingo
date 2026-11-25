import { PageHeader } from "@/components/app/PageHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import { usePresence } from "@/providers/PresenceProvider";
import { useCall } from "@/providers/CallProvider";
import { signedMediaUrl, startDirectConversation } from "@/lib/chat";
import { resolvePrivatePhoto } from "@/lib/avatar";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Camera,
  FileText,
  Flag,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  Save,
  Search,
  Settings,
  Share2,
  ShieldOff,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

type SharedMedia = { id: string; url: string; kind: "image" | "video" };
type SharedDoc = { id: string; name: string; url: string | null };
type SharedLink = { id: string; url: string };

export default function ProfilePage() {
  const { userId } = useParams();
  const { profile: me, session, refresh } = useAuth();
  const { startCall } = useCall();
  const { online } = usePresence();
  const statusRings = useStatusRings();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [isContact, setIsContact] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<"about" | "media" | "files">("about");
  const [sharedMedia, setSharedMedia] = useState<SharedMedia[]>([]);
  const [sharedDocs, setSharedDocs] = useState<SharedDoc[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editAbout, setEditAbout] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const isSelf = Boolean(me && userId === me.id);

  const load = useCallback(async () => {
    if (!userId || !me) return;
    setLoading(true);
    const { data } = await supabase
      .from("public_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setPerson((data ?? null) as Profile | null);
    if (data) {
      const [{ data: contact }, { data: block }] = await Promise.all([
        supabase
          .from("contacts")
          .select("contact_id")
          .eq("owner_id", me.id)
          .eq("contact_id", userId)
          .maybeSingle(),
        supabase
          .from("blocks")
          .select("blocked_id")
          .eq("blocker_id", me.id)
          .eq("blocked_id", userId)
          .maybeSingle(),
      ]);
      setIsContact(Boolean(contact));
      setBlocked(Boolean(block));
    }
    setLoading(false);
  }, [me, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    setPhotoUrl(null);
    if (!person) return;
    if (person.avatar_path) {
      void resolvePrivatePhoto("profile-photos", person.avatar_path).then(
        (url) => {
          if (active) setPhotoUrl(url);
        },
      );
    } else if (person.public_avatar_url) {
      setPhotoUrl(person.public_avatar_url);
    }
    return () => {
      active = false;
    };
  }, [person]);

  useEffect(() => {
    if (!person) return;
    setEditName(person.display_name ?? "");
    setEditUsername(person.username ?? "");
    setEditAbout(person.about ?? "");
  }, [person]);

  useEffect(() => {
    if (!me || !person || isSelf) return;
    let active = true;
    setSharedLoading(true);
    void (async () => {
      const { data: mine } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", me.id);
      const ids = (mine ?? []).map(
        (row) => (row as { conversation_id: string }).conversation_id,
      );
      if (ids.length === 0) {
        if (active) setSharedLoading(false);
        return;
      }
      const { data: theirs } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", person.id)
        .in("conversation_id", ids);
      const shared = (theirs ?? []).map(
        (row) => (row as { conversation_id: string }).conversation_id,
      );
      if (shared.length === 0) {
        if (active) setSharedLoading(false);
        return;
      }
      const { data: rows } = await supabase
        .from("messages")
        .select("id,body,kind,attachment_path,attachment_name,created_at")
        .in("conversation_id", shared)
        .in("kind", ["image", "video", "file"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(60);
      const media: SharedMedia[] = [];
      const docs: SharedDoc[] = [];
      const links: SharedLink[] = [];
      for (const row of (rows ?? []) as {
        id: string;
        body: string;
        kind: string;
        attachment_path: string | null;
        attachment_name: string | null;
      }[]) {
        for (const match of row.body?.match(/https?:\/\/[^\s<]+/g) ?? []) {
          links.push({ id: `${row.id}-${match}`, url: match });
        }
        if (!row.attachment_path) continue;
        if (row.kind === "image" || row.kind === "video") {
          const url = await signedMediaUrl(row.attachment_path);
          if (url) media.push({ id: row.id, url, kind: row.kind });
        } else {
          const url = await signedMediaUrl(row.attachment_path);
          docs.push({
            id: row.id,
            name: row.attachment_name ?? row.attachment_path.split("/").pop() ?? "File",
            url,
          });
        }
      }
      if (!active) return;
      setSharedMedia(media);
      setSharedDocs(docs);
      setSharedLinks(links);
      setSharedLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [isSelf, me, person]);

  async function saveProfile() {
    if (!me || savingProfile) return;
    const username = editUsername.trim().toLowerCase();
    if (editName.trim().length < 2) {
      setNotice("Enter your name.");
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setNotice("Usernames use 3–24 lowercase letters, numbers or underscores.");
      return;
    }
    setSavingProfile(true);
    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", me.id)
      .maybeSingle();
    if (taken) {
      setNotice("That username is already taken.");
      setSavingProfile(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: editName.trim(),
        username,
        about: editAbout.trim().slice(0, 280),
      })
      .eq("id", me.id);
    if (error) setNotice(error.message);
    else {
      await refresh();
      await load();
      setEditOpen(false);
      setNotice("Profile updated.");
    }
    setSavingProfile(false);
  }

  async function changeAvatar(file: File) {
    if (!me || avatarBusy) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setNotice("Choose an image under 8 MB.");
      return;
    }
    setAvatarBusy(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${me.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      setNotice(uploadError.message);
      setAvatarBusy(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", me.id);
    if (error) setNotice(error.message);
    else {
      await refresh();
      await load();
      setNotice("Profile photo updated.");
    }
    setAvatarBusy(false);
  }

  async function openChat() {
    if (!person || busy) return;
    setBusy("chat");
    try {
      const conversationId = await startDirectConversation(person.id);
      navigate(`/app/chats?c=${conversationId}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open the chat.");
    } finally {
      setBusy(null);
    }
  }

  async function call(kind: "voice" | "video") {
    if (!person || !me || busy) return;
    setBusy(kind);
    try {
      const conversationId = await startDirectConversation(person.id);
      await startCall({ conversationId, kind, peer: person });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The call could not start.");
    } finally {
      setBusy(null);
    }
  }

  async function addContact() {
    if (!me || !person) return;
    const { error } = await supabase
      .from("contacts")
      .insert({ owner_id: me.id, contact_id: person.id });
    if (error) setNotice(error.message);
    else setIsContact(true);
  }

  async function shareContact() {
    if (!person) return;
    const name = person.display_name || person.username || "PINGO user";
    const text = `${name} on PINGO · @${person.username}`;
    const url = `${window.location.origin}/app/profile/${person.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PINGO contact", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setNotice("Contact link copied to the clipboard.");
    } catch {
      // The share sheet was dismissed; nothing to report.
    }
  }

  async function toggleBlock() {
    if (!me || !person) return;
    if (blocked) {
      await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", me.id)
        .eq("blocked_id", person.id);
      setBlocked(false);
      setNotice("Unblocked.");
    } else {
      await supabase
        .from("blocks")
        .insert({ blocker_id: me.id, blocked_id: person.id });
      setBlocked(true);
      setNotice("Blocked. They can no longer message or call you.");
    }
  }

  async function submitReport() {
    if (!me || !person || reportReason.trim().length < 3) return;
    const { error } = await supabase.from("moderation_reports").insert({
      reporter_id: me.id,
      target_type: "user",
      target_id: person.id,
      reason: reportReason.trim().slice(0, 160),
    });
    setReportOpen(false);
    setReportReason("");
    setNotice(error ? error.message : "Report submitted for review.");
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!person) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium">Profile unavailable</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This account may be private, blocked or no longer available.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  const visibleOnline =
    person.online_visibility === "everyone" && online.has(person.id);
  const statusRing = statusRings[person.id] ?? null;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader
        title={isSelf ? "Your profile" : person.display_name || "Profile"}
        back="/app/chats"
        actions={
          isSelf ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              onClick={() => navigate("/app/settings")}
            >
              <Settings className="size-[19px]" />
            </Button>
          ) : undefined
        }
      />

      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Open profile photo"
            >
              <UserAvatar
                profile={person}
                size="xl"
                className="size-28"
                showPresence
                ring={statusRing}
              />
            </button>
            {isSelf && (
              <label
                className="absolute right-0 bottom-0 flex size-9 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
                aria-label="Change profile photo"
              >
                {avatarBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Camera className="size-4" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={avatarBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void changeAvatar(file);
                  }}
                />
              </label>
            )}
          </div>
          <h2 className="mt-4 flex items-center justify-center gap-1.5 text-[1.35rem] font-semibold tracking-[-0.02em]">
            {person.display_name || person.username}
            <VerifiedBadge verified={person.is_verified} />
          </h2>
          <p className="text-sm text-muted-foreground">@{person.username}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {visibleOnline ? (
              <span className="text-online">Online</span>
            ) : person.last_seen_visibility === "nobody" ? (
              "Last seen hidden"
            ) : (
              "Offline"
            )}
          </p>
          {isSelf && (
            <p className="mt-2 text-sm font-medium tabular-nums">
              {session?.user.phone ?? me?.phone ?? "No verified phone on this session"}
            </p>
          )}
          {person.about && (
            <p className="mt-4 max-w-md text-sm leading-6 text-foreground/90">
              {person.about}
            </p>
          )}
          {statusRing && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => navigate(`/app/updates?statusUser=${person.id}`)}
            >
              <span
                className={cn(
                  "size-2.5 rounded-full",
                  statusRing === "unseen" ? "bg-[var(--accent)]" : "bg-muted-foreground/50",
                )}
              />
              {statusRing === "unseen" ? "View new status" : "View status"}
            </Button>
          )}
        </div>

        {notice && (
          <p className="mt-5 rounded-md bg-secondary px-3 py-2 text-center text-xs text-muted-foreground">
            {notice}
          </p>
        )}

        {isSelf ? (
          <div className="mt-6">
            {editOpen ? (
              <div className="rounded-xl border border-border bg-card p-4 text-left">
                <p className="text-sm font-semibold">Edit profile</p>
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value.slice(0, 60))}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                  placeholder="Your name"
                />
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  Username
                </label>
                <div className="mt-1 flex items-center rounded-md border border-input bg-background px-3 focus-within:border-primary">
                  <span className="text-sm text-muted-foreground">@</span>
                  <input
                    value={editUsername}
                    onChange={(event) =>
                      setEditUsername(
                        event.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "")
                          .slice(0, 24),
                      )
                    }
                    className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
                    placeholder="username"
                  />
                </div>
                <label className="mt-3 block text-xs font-medium text-muted-foreground">
                  About
                </label>
                <textarea
                  value={editAbout}
                  onChange={(event) => setEditAbout(event.target.value.slice(0, 280))}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="A short line about you"
                />
                <p className="mt-1 text-right text-[0.6rem] text-muted-foreground">
                  {editAbout.length}/280
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void saveProfile()}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                </div>
                <p className="mt-2 text-[0.62rem] leading-5 text-muted-foreground">
                  Your username must be unique. Your phone number stays private
                  and is never shown on this profile to other people.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button className="gap-2" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" /> Edit profile
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate("/app/updates")}
                >
                  <MessageSquare className="size-4" /> Your updates
                </Button>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left">
              <Settings className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                Privacy, notifications and account settings
              </span>
              <button
                type="button"
                onClick={() => navigate("/app/settings")}
                className="text-[0.65rem] font-semibold text-primary"
              >
                Open
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2">
              <Button
                className="gap-2"
                onClick={() => void openChat()}
                disabled={Boolean(busy)}
              >
                {busy === "chat" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                Message
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void call("voice")}
                disabled={Boolean(busy)}
              >
                {busy === "voice" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Phone className="size-4" />
                )}
                Voice
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void call("video")}
                disabled={Boolean(busy)}
              >
                {busy === "video" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Video className="size-4" />
                )}
                Video
              </Button>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => void addContact()}
                disabled={isContact}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60",
                  isContact && "opacity-60",
                )}
              >
                <UserPlus className="size-4 text-primary" />
                {isContact ? "Saved in your contacts" : "Add to contacts"}
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate(`/app/search?user=${person.id}&q=`)
                }
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
              >
                <Search className="size-4 text-muted-foreground" /> Search messages
              </button>
              <button
                type="button"
                onClick={() => void shareContact()}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
              >
                <Share2 className="size-4 text-muted-foreground" /> Share contact
              </button>
              <button
                type="button"
                onClick={() => setReportOpen((open) => !open)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm hover:bg-secondary/60"
              >
                <Flag className="size-4 text-muted-foreground" /> Report account
              </button>
              <button
                type="button"
                onClick={() => void toggleBlock()}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-destructive hover:bg-destructive/5"
              >
                <ShieldOff className="size-4" />
                {blocked ? "Unblock this account" : "Block this account"}
              </button>
            </div>

            {reportOpen && (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <label className="text-xs font-medium text-muted-foreground">
                  What is wrong with this account?
                </label>
                <textarea
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value)}
                  rows={3}
                  maxLength={160}
                  className="mt-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Describe the issue"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setReportOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void submitReport()}
                    disabled={reportReason.trim().length < 3}
                  >
                    Submit report
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-1 border-b border-border">
              {(
                [
                  ["about", "About"],
                  ["media", `Media${sharedMedia.length ? ` (${sharedMedia.length})` : ""}`],
                  ["files", "Links & docs"],
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

            <div className="py-3 text-left">
              {tab === "about" && (
                <div className="space-y-2 text-xs leading-6 text-muted-foreground">
                  <p>
                    {person.about?.trim() ||
                      "This person has not added an about line."}
                  </p>
                  {person.created_at && (
                    <p>
                      Joined PINGO in{" "}
                      {new Date(person.created_at).toLocaleDateString([], {
                        month: "long",
                        year: "numeric",
                      })}
                      .
                    </p>
                  )}
                  <p>
                    Presence follows their privacy setting. Phone numbers are
                    never shown to other members.
                  </p>
                </div>
              )}

              {tab === "media" && (
                <>
                  {sharedLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : sharedMedia.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                      No photos or videos shared in your conversations yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1">
                      {sharedMedia.map((item) => (
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
                            <span className="flex size-full items-center justify-center gap-1 text-[0.6rem] text-muted-foreground">
                              <Video className="size-4" /> Video
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "files" && (
                <div className="space-y-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Link2 className="size-3.5" /> Links
                    </p>
                    {sharedLinks.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No links shared in your conversations.
                      </p>
                    ) : (
                      <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                        {sharedLinks.map((link) => (
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
                    {sharedDocs.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        No documents shared yet.
                      </p>
                    ) : (
                      <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                        {sharedDocs.map((doc) => (
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
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {photoOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="flex justify-end p-3">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-white hover:bg-white/10"
              aria-label="Close photo"
              onClick={() => setPhotoOpen(false)}
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`${person.display_name || person.username} profile photo`}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : (
              <UserAvatar profile={person} size="xl" className="size-56" />
            )}
          </div>
          {isSelf && (
            <div className="p-4 pb-8">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => navigate("/app/settings/profile")}
              >
                Change profile photo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
