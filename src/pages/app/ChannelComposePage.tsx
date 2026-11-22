import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/types";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

export default function ChannelComposePage() {
  const { channelId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!channelId) return;
    supabase
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .maybeSingle()
      .then(({ data }) => setChannel((data ?? null) as Channel | null));
  }, [channelId]);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (next.size > 25 * 1024 * 1024) {
      setError("Attachments must be smaller than 25 MB.");
      return;
    }
    setFile(next);
    setPreview(next.type.startsWith("image/") ? URL.createObjectURL(next) : null);
    setError(null);
  }

  async function publish() {
    if (!profile || !channelId || !channel || busy) return;
    if (!body.trim() && !file) {
      setError("Write something or attach a file before publishing.");
      return;
    }
    if (channel.owner_id !== profile.id) {
      setError("Only the channel owner can publish posts.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let mediaPath: string | null = null;
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        mediaPath = `${channelId}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("channel-media")
          .upload(mediaPath, file, { contentType: file.type || undefined });
        if (uploadError) throw uploadError;
      }
      const { error: insertError } = await supabase.from("channel_posts").insert({
        channel_id: channelId,
        author_id: profile.id,
        body: body.trim() || null,
        media_path: mediaPath,
        published_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      navigate(`/app/channels/${channelId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The post could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-background">
      <PageHeader
        title="Create post"
        subtitle={channel ? channel.name : "Channel"}
        back={channelId ? `/app/channels/${channelId}` : "/app/updates"}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => void publish()} disabled={busy}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Publish
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-5">
        <div className="rounded-lg border border-border bg-card p-3">
          <Textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={7}
            maxLength={4000}
            placeholder="Write the post…"
            className="resize-none border-0 bg-transparent p-1 text-[0.95rem] leading-7 shadow-none focus-visible:ring-0"
          />

          {file && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-secondary px-2.5 py-2">
              {preview ? (
                <img src={preview} alt="Attachment" className="size-12 rounded object-cover" />
              ) : (
                <ImagePlus className="size-4 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
                aria-label="Remove attachment"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-4" /> Photo or file
            </Button>
            <span className="text-[0.65rem] text-muted-foreground">{body.length}/4000</span>
          </div>
          <input ref={input} type="file" className="hidden" onChange={pick} />
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Preview
          </p>
          <article className="mt-2 rounded-lg border border-border bg-card p-4">
            <p className="text-[0.65rem] text-muted-foreground">
              {channel?.name} · just now
            </p>
            {body.trim() ? (
              <p className="mt-2 text-sm leading-6 whitespace-pre-wrap break-words">{body}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Your post text appears here.</p>
            )}
            {preview && (
              <img src={preview} alt="Post preview" className="mt-3 max-h-72 rounded object-cover" />
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
