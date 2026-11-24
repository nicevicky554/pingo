import { PageHeader } from "@/components/app/PageHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useStatusRings } from "@/hooks/use-status-rings";
import { usePresence } from "@/providers/PresenceProvider";
import { useCall } from "@/providers/CallProvider";
import { startDirectConversation } from "@/lib/chat";
import { resolvePrivatePhoto } from "@/lib/avatar";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Flag,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
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

export default function ProfilePage() {
  const { userId } = useParams();
  const { profile: me, session } = useAuth();
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

  async function searchMessages() {
    if (!person || busy) return;
    setBusy("search");
    try {
      const conversationId = await startDirectConversation(person.id);
      navigate(`/app/chats?c=${conversationId}&search=1`);
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
          <h2 className="mt-4 flex items-center justify-center gap-1.5 text-[1.35rem] font-semibold tracking-[-0.02em]">
            {person.display_name || person.username}
            <VerifiedBadge verified={person.is_verified} />
          </h2>
          <p className="text-sm text-muted-foreground">@{person.username}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {visibleOnline ? (
              <span className="text-online">Online</span>
            ) : (
              "Offline"
            )}
          </p>
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
          <ul className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
            {[
              { label: "Name", value: person.display_name || "Add your name" },
              { label: "Username", value: `@${person.username}` },
              { label: "About", value: person.about || "Add a short about" },
            ].map((row) => (
              <li key={row.label} className="border-b border-border">
                <button
                  type="button"
                  onClick={() => navigate("/app/settings/profile")}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.7rem] text-muted-foreground">
                      {row.label}
                    </span>
                    <span className="block truncate text-sm">{row.value}</span>
                  </span>
                  <Pencil className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
            <li>
              <div className="flex items-center gap-3 px-4 py-3">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.7rem] text-muted-foreground">
                    Verified phone
                  </span>
                  <span className="block text-sm tabular-nums">
                    {session?.user.phone
                      ? `+${session.user.phone.replace(/^\+/, "")}`
                      : "No verified phone on this session"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => navigate("/app/settings/account")}
                  className="text-xs font-medium text-primary"
                >
                  Change number
                </button>
              </div>
            </li>
          </ul>
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
                onClick={() => void searchMessages()}
                disabled={Boolean(busy)}
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
