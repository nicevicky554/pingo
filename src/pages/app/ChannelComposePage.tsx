import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  ImagePlus,
  Loader2,
  Lock,
  PenSquare,
  Pin,
  Send,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

type Picked = {
  id: string;
  file: File;
  url: string | null;
  kind: "image" | "video" | "file";
};

const MAX_FILE = 50 * 1024 * 1024;

async function uploadChannelFile(
  channelId: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${channelId}/${crypto.randomUUID()}-${safeName}`;

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const baseUrl = SUPABASE_URL;
    const apiKey = SUPABASE_ANON_KEY;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${baseUrl}/storage/v1/object/channel-media/${path
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
        );
        xhr.setRequestHeader("apikey", apiKey);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "false");
        if (file.type) xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
        xhr.send(file);
      });
      return path;
    } catch (err) {
      console.warn("[PINGO] direct channel upload failed, retrying via SDK", err);
    }
  }

  const { error } = await supabase.storage
    .from("channel-media")
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  onProgress(100);
  return path;
}

export default function ChannelComposePage() {
  const { channelId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [body, setBody] = useState("");
  const [items, setItems] = useState<Picked[]>([]);
  const [pin, setPin] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    };
  }, []);

  useEffect(() => {
    if (!channelId || !profile) return;
    void (async () => {
      const { data } = await supabase
        .from("channels")
        .select("*")
        .eq("id", channelId)
        .maybeSingle();
      const found = (data ?? null) as Channel | null;
      setChannel(found);
      if (!found) {
        setAllowed(false);
        return;
      }
      if (found.owner_id === profile.id) {
        setRole("owner");
        setAllowed(true);
        return;
      }
      const { data: membership } = await supabase
        .from("channel_members")
        .select("role")
        .eq("channel_id", channelId)
        .eq("user_id", profile.id)
        .maybeSingle();
      const memberRole = (membership as { role?: string } | null)?.role ?? null;
      setRole(memberRole);
      setAllowed(memberRole === "owner" || memberRole === "admin");
    })();
  }, [channelId, profile]);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;
    const tooLarge = chosen.find((file) => file.size > MAX_FILE);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 50 MB.`);
      return;
    }
    setError(null);
    setItems((current) => {
      const seen = new Set(current.map((item) => `${item.file.name}:${item.file.size}`));
      const next: Picked[] = chosen
        .filter((file) => !seen.has(`${file.name}:${file.size}`))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          url:
            file.type.startsWith("image/") || file.type.startsWith("video/")
              ? URL.createObjectURL(file)
              : null,
          kind: file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : "file",
        }));
      return [...current, ...next].slice(0, 10);
    });
  }

  function remove(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function publish() {
    if (!profile || !channelId || !channel || busy) return;
    if (!body.trim() && items.length === 0) {
      setError("Write something or attach a photo, video or document.");
      return;
    }
    if (!allowed) {
      setError("Only the channel owner and administrators can publish posts.");
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const paths: string[] = [];
      const meta: Record<string, unknown>[] = [];
      for (const [index, item] of items.entries()) {
        const path = await uploadChannelFile(channelId, item.file, (percent) => {
          setProgress(
            Math.round(((index + percent / 100) / Math.max(1, items.length)) * 95),
          );
        });
        paths.push(path);
        meta.push({
          name: item.file.name,
          size: item.file.size,
          mime: item.file.type || "application/octet-stream",
          kind: item.kind,
        });
      }
      const link = body.match(/https?:\/\/[^\s<]+/)?.[0] ?? null;
      const { error: insertError } = await supabase.from("channel_posts").insert({
        channel_id: channelId,
        author_id: profile.id,
        body: body.trim() || null,
        media_path: paths[0] ?? null,
        media_paths: paths,
        media_meta: meta,
        link_url: link,
        pinned: pin,
        pinned_at: pin ? new Date().toISOString() : null,
        published_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      setProgress(100);
      for (const item of items) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
      navigate(`/app/channels/${channelId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The post could not be published.");
    } finally {
      setBusy(false);
    }
  }

  if (allowed === false) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Lock className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold">Publishing is restricted</p>
        <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
          Only the channel owner and its administrators can publish posts.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate(channelId ? `/app/channels/${channelId}` : "/app/channels")}
        >
          Back to channel
        </Button>
      </div>
    );
  }

  if (!channel || allowed === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader
        title="Create post"
        subtitle={`${channel.name} · ${role === "owner" ? "Owner" : "Administrator"}`}
        back={`/app/channels/${channelId}`}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => void publish()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Publish
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-lg border border-border bg-card">
          <Textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={4000}
            placeholder="Write the post… links are detected automatically."
            className="resize-none border-0 bg-transparent p-3 text-[0.95rem] leading-7 shadow-none focus-visible:ring-0"
          />

          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-1 px-3 pb-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-secondary"
                >
                  {item.kind === "image" && item.url ? (
                    <img src={item.url} alt="" className="size-full object-cover" />
                  ) : item.kind === "video" && item.url ? (
                    <video src={item.url} className="size-full object-cover" muted preload="metadata" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 px-1">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="line-clamp-2 text-center text-[0.55rem] text-muted-foreground">
                        {item.file.name}
                      </span>
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[0.5rem] text-white">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.file.name}`}
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" /> Photos, video or file
            </Button>
            <span className="text-[0.65rem] text-muted-foreground">{body.length}/4000</span>
          </div>
          <input ref={input} type="file" multiple className="hidden" onChange={pick} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={pin}
            onClick={() => setPin((value) => !value)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
              pin
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            <Pin className="size-3.5" /> {pin ? "Will be pinned" : "Pin this post"}
          </button>
          <button
            type="button"
            onClick={() => setPreview((value) => !value)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
          >
            <PenSquare className="size-3.5" /> {preview ? "Hide preview" : "Preview"}
          </button>
        </div>

        {preview && (
          <article className="mt-3 rounded-lg border border-border bg-card p-4">
            <p className="text-[0.62rem] text-muted-foreground">
              {channel.name} · just now
            </p>
            {body.trim() && (
              <p className="mt-1.5 text-[0.92rem] leading-6 break-words whitespace-pre-wrap">
                {body}
              </p>
            )}
            {items.length > 0 && (
              <div className={cn("mt-2 grid gap-1", items.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                {items.map((item) =>
                  item.kind === "image" && item.url ? (
                    <img
                      key={item.id}
                      src={item.url}
                      alt=""
                      className="max-h-72 w-full rounded-md object-cover"
                    />
                  ) : item.kind === "video" && item.url ? (
                    <video
                      key={item.id}
                      src={item.url}
                      controls
                      className="max-h-72 w-full rounded-md"
                    />
                  ) : (
                    <span
                      key={item.id}
                      className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs"
                    >
                      <FileText className="size-4" /> {item.file.name}
                    </span>
                  ),
                )}
              </div>
            )}
            {!body.trim() && items.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                Your post appears here.
              </p>
            )}
          </article>
        )}

        {busy && (
          <div className="mt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              Uploading… {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="min-w-0 flex-1">{error}</span>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy}
              className="shrink-0 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 text-[0.65rem] text-muted-foreground">
          <div className="flex items-center gap-1.5 rounded-md bg-card px-3 py-2">
            <Video className="size-3.5" /> Videos play with native controls
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-card px-3 py-2">
            <FileText className="size-3.5" /> Documents stay downloadable
          </div>
        </div>
      </div>
    </div>
  );
}
