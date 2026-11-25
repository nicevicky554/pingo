import { postMediaPaths, type ChannelPost } from "@/components/channel/ChannelPostCard";
import { PageHeader } from "@/components/app/PageHeader";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/providers/BrandingProvider";
import { supabase } from "@/lib/supabase";
import type { Channel, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Bell,
  BellOff,
  Check,
  Copy,
  FileText,
  Hash,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  PenSquare,
  Share2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

type Tab = "media" | "links" | "settings";
type AdminRow = { user_id: string; role: string; profile?: Profile | null };
type MediaEntry = { path: string; url: string; kind: "image" | "video" | "file" };

export default function ChannelInfoPage() {
  const { channelId } = useParams();
  const { profile } = useAuth();
  const { assets } = useBranding();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [members, setMembers] = useState<AdminRow[]>([]);
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [subscribers, setSubscribers] = useState(0);
  const [following, setFollowing] = useState(false);
  const [muted, setMuted] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("media");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle();
    if (error) setNotice(error.message);
    const found = (data ?? null) as Channel | null;
    setChannel(found);
    setName(found?.name ?? "");
    setDescription(found?.description ?? "");

    const { data: postRows } = await supabase
      .from("channel_posts")
      .select("*")
      .eq("channel_id", channelId)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(200);
    const postList = (postRows ?? []) as ChannelPost[];
    setPosts(postList);

    const [{ count }, { data: memberRows }] = await Promise.all([
      supabase
        .from("channel_members")
        .select("user_id", { count: "exact", head: true })
        .eq("channel_id", channelId),
      supabase
        .from("channel_members")
        .select("user_id,role")
        .eq("channel_id", channelId)
        .in("role", ["owner", "admin"]),
    ]);
    setSubscribers(count ?? 0);
    const rows = (memberRows ?? []) as { user_id: string; role: string }[];
    const ids = rows.map((row) => row.user_id);
    let people: Profile[] = [];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", ids);
      people = (profiles ?? []) as Profile[];
    }
    const byId = new Map(people.map((person) => [person.id, person]));
    setMembers(rows.map((row) => ({ ...row, profile: byId.get(row.user_id) ?? null })));

    const paths: MediaEntry[] = [];
    for (const post of postList) {
      for (const path of postMediaPaths(post)) {
        const kind = /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(path)
          ? "image"
          : /\.(mp4|webm|mov|m4v|ogv)$/i.test(path)
            ? "video"
            : "file";
        paths.push({ path, url: "", kind });
      }
    }
    setMedia(paths);

    if (profile) {
      const { data: membership } = await supabase
        .from("channel_members")
        .select("user_id,role,muted")
        .eq("channel_id", channelId)
        .eq("user_id", profile.id)
        .maybeSingle();
      setFollowing(Boolean(membership));
      setMuted(Boolean((membership as { muted?: boolean } | null)?.muted));
      setMyRole(membership?.role ?? null);
    }
    setLoading(false);
  }, [channelId, profile]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    if (media.length === 0) return;
    let active = true;
    void (async () => {
      const signed = await Promise.all(
        media.slice(0, 60).map(async (entry) => {
          if (entry.kind === "file") return entry;
          const { data } = await supabase.storage
            .from("channel-media")
            .createSignedUrl(entry.path, 3600);
          return { ...entry, url: data?.signedUrl ?? "" };
        }),
      );
      if (active) setMedia(signed);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.length, channelId]);

  const links = useMemo(() => {
    const found: { url: string; postId: string }[] = [];
    for (const post of posts) {
      if (post.link_url) found.push({ url: post.link_url, postId: post.id });
      for (const match of (post.body ?? "").match(/https?:\/\/[^\s<]+/g) ?? []) {
        if (!found.some((entry) => entry.url === match)) {
          found.push({ url: match, postId: post.id });
        }
      }
    }
    return found;
  }, [posts]);

  const files = useMemo(
    () =>
      media.filter((entry) => entry.kind === "file").concat(
        posts
          .flatMap((post) => post.media_meta ?? [])
          .filter((meta) => meta?.name && meta?.mime && !meta.mime.startsWith("image/") && !meta.mime.startsWith("video/"))
          .map((meta) => ({
            path: meta.name ?? "Document",
            url: "",
            kind: "file" as const,
          })),
      ),
    [media, posts],
  );

  const canManage =
    Boolean(channel) &&
    (channel?.owner_id === profile?.id || myRole === "owner" || myRole === "admin");

  async function toggleFollow() {
    if (!channel || !profile || busy) return;
    setBusy(true);
    if (following) {
      const { error } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channel.id)
        .eq("user_id", profile.id);
      if (error) setNotice(error.message);
      else {
        setFollowing(false);
        setSubscribers((current) => Math.max(0, current - 1));
      }
    } else {
      const { error } = await supabase.from("channel_members").insert({
        channel_id: channel.id,
        user_id: profile.id,
      });
      if (error) setNotice(error.message);
      else {
        setFollowing(true);
        setSubscribers((current) => current + 1);
      }
    }
    setBusy(false);
  }

  async function toggleMute() {
    if (!channel || !profile) return;
    const next = !muted;
    const { error } = await supabase
      .from("channel_members")
      .update({ muted: next })
      .eq("channel_id", channel.id)
      .eq("user_id", profile.id);
    if (error) setNotice(error.message);
    else setMuted(next);
  }

  async function saveDetails() {
    if (!channel || saving) return;
    if (name.trim().length < 2) {
      setNotice("A channel name needs at least two characters.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("channels")
      .update({
        name: name.trim(),
        description: description.trim() || null,
      })
      .eq("id", channel.id);
    if (error) setNotice(error.message);
    else {
      setEditing(false);
      await load();
    }
    setSaving(false);
  }

  async function updateChannel(patch: Record<string, unknown>) {
    if (!channel) return;
    const { error } = await supabase
      .from("channels")
      .update(patch)
      .eq("id", channel.id);
    if (error) setNotice(error.message);
    else setChannel((current) => (current ? { ...current, ...patch } as Channel : current));
  }

  async function share() {
    if (!channel) return;
    const base = `${window.location.origin}/app/channels/${channel.id}`;
    const url =
      !channel.is_public && channel.invite_code
        ? `${base}?invite=${channel.invite_code}`
        : base;
    try {
      if (navigator.share) {
        await navigator.share({ title: channel.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Invite link copied.");
    } catch {
      // dismissed
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium">Channel unavailable</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/app/channels")}>
          Browse channels
        </Button>
      </div>
    );
  }

  const avatar = channel.avatar_url ?? assets.default_channel_url ?? null;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Channel info" back={`/app/channels/${channel.id}`} />

      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <div className="flex flex-col items-center text-center">
          {avatar ? (
            <img
              src={avatar}
              alt={channel.name}
              className="size-24 rounded-full object-cover ring-1 ring-border"
            />
          ) : (
            <span className="flex size-24 items-center justify-center rounded-full bg-secondary text-primary ring-1 ring-border">
              <Hash className="size-9" />
            </span>
          )}

          {editing ? (
            <div className="mt-4 w-full text-left">
              <label className="text-xs font-medium text-muted-foreground">
                Channel name
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
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
                maxLength={500}
                className="mt-1.5 resize-none"
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void saveDetails()} disabled={saving}>
                  {saving && <Loader2 className="size-3.5 animate-spin" />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mt-3 flex items-center justify-center gap-1.5 text-xl font-semibold tracking-[-0.02em]">
                {channel.name}
                <VerifiedBadge verified={channel.is_verified} label="Verified channel" />
              </h1>
              <p className="text-sm text-muted-foreground">@{channel.username}</p>
              <p className="mt-1 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UsersRound className="size-3" />
                  {subscribers.toLocaleString()} subscribers
                </span>
                <span className="flex items-center gap-1">
                  {channel.is_public ? (
                    <>
                      <Hash className="size-3" /> Public
                    </>
                  ) : (
                    <>
                      <Lock className="size-3" /> Private
                    </>
                  )}
                </span>
                <span>{posts.length} posts</span>
              </p>
              {channel.description && (
                <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
                  {channel.description}
                </p>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setEditing(true)}
                >
                  Edit channel details
                </Button>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {channel.owner_id !== profile?.id && (
            <Button
              variant={following ? "outline" : "default"}
              className="flex-1 gap-2"
              onClick={() => void toggleFollow()}
              disabled={busy}
            >
              {following ? <Check className="size-4" /> : <Bell className="size-4" />}
              {following ? "Subscribed" : "Subscribe"}
            </Button>
          )}
          {following && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void toggleMute()}
            >
              {muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
              {muted ? "Unmute" : "Mute"}
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => void share()}>
            <Share2 className="size-4" /> Invite
          </Button>
          {canManage && (
            <Button
              className="gap-2"
              onClick={() => navigate(`/app/channels/${channel.id}/compose`)}
            >
              <PenSquare className="size-4" /> Post
            </Button>
          )}
        </div>

        {!channel.is_public && channel.invite_code && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-[0.68rem] text-muted-foreground">
              {`${window.location.origin}/app/channels/${channel.id}?invite=${channel.invite_code}`}
            </code>
            <button
              type="button"
              aria-label="Copy invite link"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/app/channels/${channel.id}?invite=${channel.invite_code}`,
                );
                setNotice("Invite link copied.");
              }}
              className="text-primary"
            >
              <Copy className="size-4" />
            </button>
          </div>
        )}

        {notice && (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            {notice}
          </p>
        )}

        <div className="mt-5 flex gap-1 border-b border-border">
          {(
            [
              ["media", `Media ${media.length ? `(${media.length})` : ""}`],
              ["links", `Links ${links.length ? `(${links.length})` : ""}`],
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

        {tab === "media" && (
          <div className="mt-3">
            {media.length === 0 ? (
              <EmptyInfo
                icon={<ImageIcon className="size-5" />}
                title="No media yet"
                body="Photos and videos posted to this channel appear here."
              />
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {media.map((entry) => (
                  <a
                    key={entry.path}
                    href={entry.url || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-square overflow-hidden rounded-md bg-secondary"
                  >
                    {entry.kind === "image" && entry.url ? (
                      <img
                        src={entry.url}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : entry.kind === "video" ? (
                      <span className="flex size-full items-center justify-center text-[0.6rem] font-medium text-muted-foreground">
                        Video
                      </span>
                    ) : (
                      <span className="flex size-full items-center justify-center">
                        <FileText className="size-5 text-muted-foreground" />
                      </span>
                    )}
                  </a>
                ))}
              </div>
            )}

            <h3 className="mt-5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Documents
            </h3>
            {files.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No documents shared yet.
              </p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card">
                {files.map((entry, index) => (
                  <div
                    key={`${entry.path}-${index}`}
                    className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {entry.path.split("/").pop()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="mt-3">
            {links.length === 0 ? (
              <EmptyInfo
                icon={<Link2 className="size-5" />}
                title="No links yet"
                body="Links shared in channel posts are collected here."
              />
            ) : (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {links.map((entry) => (
                  <a
                    key={`${entry.postId}-${entry.url}`}
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center gap-2 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-secondary/60"
                  >
                    <Link2 className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {entry.url}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="mt-3 space-y-3">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              {members.map((row) => (
                <div
                  key={row.user_id}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[0.65rem] font-semibold text-primary">
                    {(row.profile?.display_name || row.profile?.username || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {row.profile?.display_name || row.profile?.username || "PINGO user"}
                    </span>
                    <span className="block truncate text-[0.62rem] text-muted-foreground">
                      @{row.profile?.username ?? "unknown"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.58rem] font-medium capitalize",
                      row.role === "owner"
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-primary",
                    )}
                  >
                    {row.role === "owner" && <ShieldCheck className="size-2.5" />}
                    {row.role}
                  </span>
                </div>
              ))}
            </div>

            {canManage && (
              <>
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <ToggleRow
                    label="Allow comments"
                    description="Subscribers can discuss each post in a comment thread."
                    value={Boolean(channel.comments_enabled)}
                    onChange={(value) => void updateChannel({ comments_enabled: value })}
                  />
                  <ToggleRow
                    label="Public channel"
                    description={
                      channel.is_public
                        ? "Anyone can find and read this channel."
                        : "Only people with the invite link can join."
                    }
                    value={Boolean(channel.is_public)}
                    onChange={(value) => void updateChannel({ is_public: value })}
                    disabled={channel.owner_id !== profile?.id}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => navigate(`/app/channels/${channel.id}/admins`)}
                  >
                    <ShieldCheck className="size-4" /> Admins
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => navigate(`/app/channels/${channel.id}/subscribers`)}
                  >
                    <UsersRound className="size-4" /> Subscribers
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyInfo({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <p className="mt-2 text-xs font-semibold">{title}</p>
      <p className="mt-1 max-w-[16rem] text-[0.68rem] leading-5 text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-3 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-0.5 text-[0.65rem] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
          value ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            value ? "left-4.5" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
