import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Image as ImageIcon, Loader2, RotateCw, Type, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

const BACKGROUNDS = ["#147D80", "#1F2937", "#7C3AED", "#B45309", "#BE123C", "#0F766E"];

type Kind = "text" | "image" | "video";

export default function StatusComposerPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("text");
  const [body, setBody] = useState("");
  const [caption, setCaption] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [media, setMedia] = useState<
    { file: File; url: string; kind: "image" | "video"; rotation: number }[]
  >([]);
  const [audience, setAudience] = useState<"contacts" | "everyone" | "nobody">("contacts");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("user_settings")
      .select("status_visibility")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        const value = (data as { status_visibility?: string } | null)?.status_visibility;
        if (value === "everyone" || value === "contacts" || value === "nobody") {
          setAudience(value);
        }
      });
  }, [profile]);

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (next.length === 0) return;
    const tooLarge = next.find((item) => item.size > 25 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 25 MB.`);
      return;
    }
    const items = next.map((item) => ({
      file: item,
      url: URL.createObjectURL(item),
      kind: (item.type.startsWith("video/") ? "video" : "image") as
        | "image"
        | "video",
      rotation: 0,
    }));
    setMedia((current) => [...current, ...items].slice(0, 10));
    setKind(items[0]?.kind ?? "image");
    setError(null);
  }

  function removeMedia(url: string) {
    URL.revokeObjectURL(url);
    setMedia((current) => current.filter((item) => item.url !== url));
  }

  const mediaRef = useRef(media);
  mediaRef.current = media;
  useEffect(() => {
    return () => {
      for (const item of mediaRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  async function publish() {
    if (!profile || busy) return;
    if (kind === "text" && !body.trim()) {
      setError("Write something to share.");
      return;
    }
    if (kind !== "text" && media.length === 0) {
      setError("Choose at least one photo or video to share.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await supabase
        .from("user_settings")
        .update({ status_visibility: audience })
        .eq("user_id", profile.id);

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const items =
        kind === "text"
          ? [{ kind: "text" as const, item: null }]
          : media.map((item) => ({ kind: item.kind, item }));

      for (const [index, entry] of items.entries()) {
        let mediaPath: string | null = null;
        if (entry.item) {
          const extension =
            entry.item.file.name.split(".").pop()?.toLowerCase() || "bin";
          mediaPath = `${profile.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("status-media")
            .upload(mediaPath, entry.item.file, {
              contentType: entry.item.file.type || undefined,
            });
          if (uploadError) throw uploadError;
        }

        const { error: insertError } = await supabase.from("status_updates").insert({
          user_id: profile.id,
          kind: entry.kind,
          body: entry.kind === "text" ? body.trim() : null,
          media_path: mediaPath,
          background: entry.kind === "text" ? background : null,
          rotation: entry.item?.rotation ?? 0,
          caption:
            entry.kind === "text"
              ? null
              : [caption.trim(), index > 0 ? `Part ${index + 1}` : ""]
                  .filter(Boolean)
                  .join(" · ") || null,
          expires_at: expiresAt,
        });
        if (insertError) throw insertError;
      }
      for (const item of media) URL.revokeObjectURL(item.url);
      navigate("/app/updates", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The status could not be shared.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-[#0d151c] text-white">
      <header className="flex h-14 items-center gap-2 border-b border-white/10 px-3">
        <button
          type="button"
          onClick={() => navigate("/app/updates")}
          className="rounded-md px-2 py-1.5 text-sm text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
        <h1 className="flex-1 text-center text-sm font-semibold">New status</h1>
        <Button size="sm" className="gap-1.5" onClick={() => void publish()} disabled={busy}>
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Share status
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-3 py-4">
        <div className="flex gap-1 self-center rounded-full bg-white/10 p-1">
          {(
            [
              ["text", "Text", Type],
              ["image", "Photo", ImageIcon],
              ["video", "Video", Video],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setKind(id);
                if (id === "text") {
                  for (const item of media) URL.revokeObjectURL(item.url);
                  setMedia([]);
                } else {
                  input.current?.click();
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
                kind === id ? "bg-white text-[#0d151c]" : "text-white/70",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="relative mt-4 flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-xl">
          {kind === "text" ? (
            <div
              className="flex size-full min-h-[320px] items-center justify-center rounded-xl p-8"
              style={{ background }}
            >
              <p className="max-h-[300px] overflow-y-auto text-center text-xl leading-8 font-medium whitespace-pre-wrap break-words">
                {body || "Type your status…"}
              </p>
            </div>
          ) : media.length > 0 ? (
            <div className={cn("grid w-full gap-2", media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {media.map((item) => (
                <div key={item.url} className="relative overflow-hidden rounded-xl bg-black">
                  {item.kind === "video" ? (
                    <video
                      src={item.url}
                      controls
                      className="max-h-[46dvh] w-full object-contain"
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  ) : (
                    <img
                      src={item.url}
                      alt="Status preview"
                      className="max-h-[46dvh] w-full object-contain"
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setMedia((current) =>
                        current.map((entry) =>
                          entry.url === item.url
                            ? {
                                ...entry,
                                rotation: (entry.rotation + 90) % 360,
                              }
                            : entry,
                        ),
                      )
                    }
                    aria-label="Rotate media"
                    className="absolute bottom-2 left-2 flex size-8 items-center justify-center rounded-full bg-black/60"
                  >
                    <RotateCw className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMedia(item.url)}
                    aria-label="Remove media"
                    className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex size-full min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/25 text-white/60"
            >
              {kind === "video" ? <Video className="size-7" /> : <ImageIcon className="size-7" />}
              <span className="text-sm">Choose {kind === "video" ? "a video" : "a photo"}</span>
            </button>
          )}
        </div>

        <input
          ref={input}
          type="file"
          accept={kind === "video" ? "video/*" : "image/*,video/*"}
          multiple
          className="hidden"
          onChange={pick}
        />

        <div className="mt-4 space-y-3">
          {kind === "text" ? (
            <>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={3}
                maxLength={700}
                placeholder="What's on your mind?"
                className="resize-none border-white/15 bg-white/10 text-white placeholder:text-white/50"
              />
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] text-white/50">Background</span>
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackground(color)}
                    aria-label={`Background ${color}`}
                    className={cn(
                      "size-6 rounded-full border-2",
                      background === color ? "border-white" : "border-transparent",
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>
            </>
          ) : (
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={300}
              placeholder="Add a caption"
              className="h-10 w-full rounded-md border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/50"
            />
          )}

          <label className="flex items-center justify-between rounded-md bg-white/10 px-3 py-2 text-xs">
            <span className="text-white/70">Who can see this</span>
            <select
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as "contacts" | "everyone" | "nobody")
              }
              className="bg-transparent text-white outline-none"
            >
              <option className="text-black" value="contacts">
                My contacts
              </option>
              <option className="text-black" value="everyone">
                Everyone
              </option>
              <option className="text-black" value="nobody">
                Only me
              </option>
            </select>
          </label>
          <p className="text-[0.65rem] text-white/40">Statuses expire after 24 hours.</p>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-destructive/20 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
