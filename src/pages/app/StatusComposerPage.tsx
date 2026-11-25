import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AtSign,
  Check,
  ChevronDown,
  Crop,
  Image as ImageIcon,
  Loader2,
  Palette,
  PenLine,
  Play,
  RotateCw,
  Scissors,
  Smile,
  Trash2,
  Type,
  Users,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

const BACKGROUNDS = [
  "#0F3D3E",
  "#12605E",
  "#174C46",
  "#1D3A4A",
  "#2B2F36",
  "#5A3F2E",
  "#4A2C3D",
  "#3C4A2F",
  "#7A3B2E",
  "#111827",
];

const FONTS = [
  { id: "inter", label: "Inter", css: "var(--font-sans, Inter, system-ui)" },
  { id: "serif", label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono", css: "'Courier New', monospace" },
  { id: "rounded", label: "Rounded", css: "'Trebuchet MS', 'Segoe UI', sans-serif" },
];

const TEXT_COLORS = ["#FFFFFF", "#0B1F1E", "#FFE9A8", "#FFD1DC", "#C8F4EA"];

const STICKERS = ["😀", "😍", "🔥", "🎉", "✨", "☀️", "🌙", "❤️", "👏", "🙌"];

type Kind = "text" | "media";
type AudienceMode =
  | "contacts"
  | "contacts_except"
  | "only"
  | "everyone"
  | "nobody";

const AUDIENCE_LABELS: Record<AudienceMode, string> = {
  contacts: "My contacts",
  contacts_except: "My contacts except…",
  only: "Only share with…",
  everyone: "Everyone",
  nobody: "Only me",
};

type Stroke = { x: number; y: number }[];
type MediaItem = {
  id: string;
  file: File;
  url: string;
  kind: "image" | "video";
  rotation: number;
  cropSquare: boolean;
  strokes: Stroke[];
  overlayText: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
};

/**
 * Bake rotation, square crop, pen strokes and the text overlay into one JPEG.
 * Drawing coordinates are stored 0–100 so the export is independent of the
 * on-screen size.
 */
async function bakeImage(item: MediaItem): Promise<Blob> {
  const image = new Image();
  image.src = item.url;
  await image.decode();
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const rotation = ((item.rotation % 360) + 360) % 360;
  const rotated = rotation === 90 || rotation === 270;
  let width = rotated ? sourceHeight : sourceWidth;
  let height = rotated ? sourceWidth : sourceHeight;
  let offsetX = 0;
  let offsetY = 0;
  if (item.cropSquare) {
    const side = Math.min(width, height);
    offsetX = (width - side) / 2;
    offsetY = (height - side) / 2;
    width = side;
    height = side;
  }
  const max = 1600;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return item.file;
  context.save();
  context.translate(-offsetX, -offsetY);
  context.translate(
    rotation === 180 || rotation === 270 ? sourceWidth : 0,
    rotation === 90 || rotation === 180 ? sourceHeight : 0,
  );
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  context.restore();

  const w = canvas.width;
  const h = canvas.height;
  const sx = w / 100;
  const sy = h / 100;
  context.strokeStyle = "#ffffff";
  context.lineWidth = Math.max(3, w * 0.006);
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of item.strokes) {
    if (stroke.length < 2) continue;
    context.beginPath();
    context.moveTo(stroke[0].x * sx, stroke[0].y * sy);
    for (const point of stroke.slice(1)) {
      context.lineTo(point.x * sx, point.y * sy);
    }
    context.stroke();
  }

  const overlay = item.overlayText.trim();
  if (overlay) {
    const size = Math.max(16, Math.round(w * 0.045));
    context.font = `600 ${size}px Inter, system-ui, sans-serif`;
    context.textAlign = "center";
    context.fillStyle = "rgba(0,0,0,0.45)";
    const lines = wrap(context, overlay, w * 0.86);
    const blockHeight = lines.length * size * 1.3;
    context.fillRect(0, h - blockHeight - size, w, blockHeight + size * 1.4);
    context.fillStyle = "#ffffff";
    lines.forEach((line, index) => {
      context.fillText(
        line,
        w / 2,
        h - blockHeight + index * size * 1.3 + size,
      );
    });
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? item.file),
      "image/jpeg",
      0.9,
    );
  });
}

function wrap(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export default function StatusComposerPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("text");
  const [body, setBody] = useState("");
  const [caption, setCaption] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [font, setFont] = useState(FONTS[0].id);
  const [fontSize, setFontSize] = useState(30);
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pen, setPen] = useState(false);
  const [drawingStroke, setDrawingStroke] = useState<Stroke>([]);
  const [audience, setAudience] = useState<AudienceMode>("contacts");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [exceptIds, setExceptIds] = useState<Set<string>>(new Set());
  const [onlyIds, setOnlyIds] = useState<Set<string>>(new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

  const active = items[activeIndex] ?? null;
  const fontCss = useMemo(
    () => FONTS.find((entry) => entry.id === font)?.css ?? FONTS[0].css,
    [font],
  );

  useEffect(() => {
    if (!profile) return;
    let mounted = true;
    void (async () => {
      const [{ data: settings }, { data: rules }, { data: saved }] =
        await Promise.all([
          supabase
            .from("user_settings")
            .select("status_visibility")
            .eq("user_id", profile.id)
            .maybeSingle(),
          supabase
            .from("status_audience")
            .select("viewer_id,rule")
            .eq("user_id", profile.id),
          supabase
            .from("contacts")
            .select("contact_id")
            .eq("owner_id", profile.id),
        ]);
      if (!mounted) return;
      const value = (settings as { status_visibility?: string } | null)
        ?.status_visibility;
      if (
        value === "everyone" ||
        value === "contacts" ||
        value === "nobody" ||
        value === "contacts_except" ||
        value === "only"
      ) {
        setAudience(value);
      }
      const rows = (rules ?? []) as { viewer_id: string; rule: string }[];
      setExceptIds(
        new Set(
          rows.filter((row) => row.rule === "except").map((row) => row.viewer_id),
        ),
      );
      setOnlyIds(
        new Set(
          rows.filter((row) => row.rule === "only").map((row) => row.viewer_id),
        ),
      );
      const ids = (saved ?? []).map(
        (row: { contact_id: string }) => row.contact_id,
      );
      if (ids.length > 0) {
        const { data: people } = await supabase
          .from("public_profiles")
          .select("*")
          .in("id", ids);
        if (mounted) setContacts((people ?? []) as Profile[]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile]);

  function openPicker(kindWanted: "image" | "video") {
    if (kindWanted === "video") videoInputRef.current?.click();
    else inputRef.current?.click();
  }

  function pick(
    event: React.ChangeEvent<HTMLInputElement>,
    wanted: "image" | "video",
  ) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;
    const tooLarge = chosen.find((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 50 MB.`);
      return;
    }
    const next: MediaItem[] = chosen
      .filter((file) =>
        wanted === "video"
          ? file.type.startsWith("video/")
          : file.type.startsWith("image/") || file.type.startsWith("video/"),
      )
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith("video/") ? "video" : "image",
        rotation: 0,
        cropSquare: false,
        strokes: [],
        overlayText: "",
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
      }));
    if (next.length === 0) {
      setError(
        wanted === "video" ? "Choose a video file." : "Choose a photo or video.",
      );
      return;
    }
    setItems((current) => [...current, ...next].slice(0, 10));
    setActiveIndex(kind === "media" ? items.length : 0);
    setKind("media");
    setError(null);
  }

  function updateActive(patch: Partial<MediaItem>) {
    setItems((current) =>
      current.map((item, index) =>
        index === activeIndex ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const next = current.filter((item) => item.id !== id);
      if (next.length === 0) setKind("text");
      setActiveIndex((index) => Math.max(0, Math.min(index, next.length - 1)));
      return next;
    });
  }

  function pointerPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function insertMention(person: Profile) {
    const handle = person.username ? `@${person.username} ` : "";
    if (kind === "media" && active) {
      updateActive({ overlayText: `${active.overlayText}${handle}` });
    } else {
      setBody((current) => `${current}${handle}`);
    }
    setMentionOpen(false);
  }

  function toggle(
    id: string,
    set: Set<string>,
    update: (next: Set<string>) => void,
  ) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  }

  async function publish() {
    if (!profile || busy) return;
    if (kind === "text" && !body.trim()) {
      setError("Write something to share.");
      return;
    }
    if (kind === "media" && items.length === 0) {
      setError("Choose at least one photo or video to share.");
      return;
    }
    if (audience === "only" && onlyIds.size === 0) {
      setError("Choose at least one person to share this status with.");
      return;
    }

    setBusy(true);
    setError(null);
    setProgress(0);

    try {
      const { error: settingsError } = await supabase
        .from("user_settings")
        .update({ status_visibility: audience })
        .eq("user_id", profile.id);
      if (settingsError) throw settingsError;

      const { error: clearError } = await supabase
        .from("status_audience")
        .delete()
        .eq("user_id", profile.id);
      if (clearError) throw clearError;

      if (audience === "only" || audience === "contacts_except") {
        const selected = audience === "only" ? onlyIds : exceptIds;
        const rule = audience === "only" ? "only" : "except";
        if (selected.size > 0) {
          const { error: ruleError } = await supabase
            .from("status_audience")
            .insert(
              Array.from(selected).map((viewer_id) => ({
                user_id: profile.id,
                viewer_id,
                rule,
              })),
            );
          if (ruleError) throw ruleError;
        }
      }

      const expiresAt = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      if (kind === "text") {
        const payload = {
          user_id: profile.id,
          kind: "text" as const,
          body: body.trim(),
          background,
          text_color: textColor,
          font_family: font,
          font_size: fontSize,
          text_align: align,
          expires_at: expiresAt,
        };
        let { error: insertError } = await supabase
          .from("status_updates")
          .insert(payload);
        if (
          insertError &&
          /column|schema cache|does not exist/i.test(insertError.message)
        ) {
          ({ error: insertError } = await supabase
            .from("status_updates")
            .insert({
              user_id: payload.user_id,
              kind: "text",
              body: payload.body,
              background: payload.background,
              expires_at: payload.expires_at,
            }));
        }
        if (insertError) throw insertError;
      } else {
        for (const [index, item] of items.entries()) {
          setProgress(Math.round((index / items.length) * 90));
          let blob: Blob = item.file;
          let extension = item.file.name.split(".").pop()?.toLowerCase() || "bin";
          let mime = item.file.type || "application/octet-stream";
          if (item.kind === "image") {
            blob = await bakeImage(item);
            extension = "jpg";
            mime = "image/jpeg";
          }
          const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("status-media")
            .upload(path, blob, { contentType: mime, upsert: false });
          if (uploadError) throw uploadError;

          const payload: Record<string, unknown> = {
            user_id: profile.id,
            kind: item.kind,
            body: null,
            media_path: path,
            background: null,
            caption: caption.trim() || null,
            // Photos are flattened on the canvas (rotation, crop, pen, overlay),
            // so storing those again would apply them twice in the viewer.
            rotation: item.kind === "video" ? item.rotation : 0,
            overlay: [],
            expires_at: expiresAt,
            media_meta: {
              name: item.file.name,
              size: blob.size,
              mime,
              duration: item.kind === "video" ? item.duration : null,
              trimmed: item.kind === "video" && item.trimStart > 0.05,
              part: index + 1,
              parts: items.length,
            },
          };
          if (item.kind === "video") {
            payload.trim_start_seconds = item.trimStart;
            payload.trim_end_seconds =
              item.trimEnd > item.trimStart ? item.trimEnd : null;
          }

          let { error: insertError } = await supabase
            .from("status_updates")
            .insert(payload);
          // Deployments that have not applied migration 0020 yet still publish
          // the core status rather than failing on presentation metadata.
          if (
            insertError &&
            /column|schema cache|does not exist/i.test(insertError.message)
          ) {
            const minimal: Record<string, unknown> = {
              user_id: payload.user_id,
              kind: payload.kind,
              body: null,
              media_path: payload.media_path,
              caption: payload.caption,
              rotation: payload.rotation,
              expires_at: payload.expires_at,
            };
            ({ error: insertError } = await supabase
              .from("status_updates")
              .insert(minimal));
          }
          if (insertError) throw insertError;
        }
      }

      setProgress(100);
      for (const item of items) URL.revokeObjectURL(item.url);
      navigate("/app/updates", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The status could not be shared. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return null;

  const audienceCount =
    audience === "only" ? onlyIds.size : audience === "contacts_except" ? exceptIds.size : 0;

  return (
    <div className="page-enter flex min-h-dvh flex-col bg-[#08100f] text-white">
      <header className="safe-top flex h-14 shrink-0 items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => navigate("/app/updates")}
          aria-label="Close status editor"
          className="flex size-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">New status</p>
          <p className="truncate text-[0.62rem] text-white/50">
            Disappears after 24 hours
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAudienceOpen((open) => !open)}
          className="flex max-w-[9.5rem] items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1.5 text-[0.68rem] font-medium"
        >
          <Users className="size-3.5 shrink-0" />
          <span className="truncate">{AUDIENCE_LABELS[audience]}</span>
          {audienceCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-[0.55rem]">
              {audienceCount}
            </span>
          )}
        </button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => void publish()}
          disabled={busy}
        >
          {busy && <Loader2 className="size-3.5 animate-spin" />}
          Share
        </Button>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 px-3 pb-4">
        <div className="flex shrink-0 justify-center gap-1 rounded-full bg-white/10 p-1">
          <button
            type="button"
            onClick={() => {
              for (const item of items) URL.revokeObjectURL(item.url);
              setItems([]);
              setKind("text");
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              kind === "text" ? "bg-white text-[#08100f]" : "text-white/70",
            )}
          >
            <Type className="size-3.5" /> Text
          </button>
          <button
            type="button"
            onClick={() => openPicker("image")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              kind === "media" && active?.kind === "image"
                ? "bg-white text-[#08100f]"
                : "text-white/70",
            )}
          >
            <ImageIcon className="size-3.5" /> Photo
          </button>
          <button
            type="button"
            onClick={() => openPicker("video")}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              kind === "media" && active?.kind === "video"
                ? "bg-white text-[#08100f]"
                : "text-white/70",
            )}
          >
            <Video className="size-3.5" /> Video
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => pick(event, "image")}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => pick(event, "video")}
        />

        {kind === "text" ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div
              className="relative flex min-h-[42dvh] flex-1 items-center justify-center overflow-hidden rounded-2xl px-4"
              style={{ background }}
            >
              <textarea
                autoFocus
                value={body}
                onChange={(event) => setBody(event.target.value.slice(0, 700))}
                placeholder="Type your status…"
                aria-label="Status text"
                className="h-full min-h-[38dvh] w-full resize-none bg-transparent text-center outline-none placeholder:text-white/40 focus:outline-none"
                style={{
                  color: textColor,
                  fontFamily: fontCss,
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.35,
                  textAlign: align,
                }}
              />
              <span className="absolute right-3 bottom-2 text-[0.6rem] text-white/50">
                {body.length}/700
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                <Palette className="size-4 shrink-0 text-white/50" />
                {BACKGROUNDS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBackground(color)}
                    aria-label={`Background ${color}`}
                    className={cn(
                      "size-7 shrink-0 rounded-full border-2",
                      background === color
                        ? "border-white"
                        : "border-white/15",
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                <Type className="size-4 shrink-0 text-white/50" />
                {FONTS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setFont(entry.id)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[0.65rem]",
                      font === entry.id
                        ? "bg-white text-[#08100f]"
                        : "bg-white/10 text-white/70",
                    )}
                    style={{ fontFamily: entry.css }}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full bg-white/10 p-0.5">
                  {(
                    [
                      ["left", AlignLeft],
                      ["center", AlignCenter],
                      ["right", AlignRight],
                    ] as const
                  ).map(([value, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAlign(value)}
                      aria-label={`Align ${value}`}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full",
                        align === value
                          ? "bg-white text-[#08100f]"
                          : "text-white/70",
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                  <span className="text-[0.62rem] text-white/60">Size</span>
                  <input
                    type="range"
                    min={16}
                    max={56}
                    value={fontSize}
                    onChange={(event) => setFontSize(Number(event.target.value))}
                    className="w-24 accent-[var(--primary)]"
                    aria-label="Text size"
                  />
                </label>
                <div className="flex items-center gap-1">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setTextColor(color)}
                      aria-label={`Text colour ${color}`}
                      className={cn(
                        "size-5 rounded-full border",
                        textColor === color ? "border-white" : "border-white/30",
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                <Smile className="size-4 shrink-0 text-white/50" />
                {STICKERS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setBody((current) => `${current}${emoji}`)}
                    className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm"
                    aria-label={`Insert ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMentionOpen((open) => !open)}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] text-white/80"
                >
                  <AtSign className="size-3.5" /> Mention
                </button>
              </div>
              {mentionOpen && (
                <ContactPicker contacts={contacts} onPick={insertMention} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="relative flex min-h-[38dvh] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black">
              {active ? (
                active.kind === "video" ? (
                  <video
                    src={active.url}
                    controls
                    playsInline
                    className="max-h-[46dvh] w-full object-contain"
                    style={{ transform: `rotate(${active.rotation}deg)` }}
                    onLoadedMetadata={(event) => {
                      const duration = event.currentTarget.duration || 0;
                      updateActive({
                        duration,
                        trimEnd:
                          active.trimEnd > 0 ? active.trimEnd : duration,
                      });
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      "relative inline-block max-h-[46dvh] max-w-full",
                      active.cropSquare && "aspect-square",
                    )}
                  >
                    <img
                      src={active.url}
                      alt="Status media preview"
                      className={cn(
                        "max-h-[46dvh] w-auto max-w-full object-contain",
                        active.cropSquare && "size-full object-cover",
                      )}
                      style={{ transform: `rotate(${active.rotation}deg)` }}
                    />
                    {active.strokes.length > 0 && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-0 size-full"
                      >
                        {active.strokes.map((stroke, index) => (
                          <polyline
                            key={index}
                            points={stroke
                              .map((point) => `${point.x},${point.y}`)
                              .join(" ")}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth={1}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ))}
                      </svg>
                    )}
                    {pen && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 size-full touch-none"
                        onPointerDown={(event) => {
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDrawingStroke([pointerPoint(event)]);
                        }}
                        onPointerMove={(event) => {
                          if (!event.currentTarget.hasPointerCapture(event.pointerId))
                            return;
                          setDrawingStroke((current) => [
                            ...current,
                            pointerPoint(event),
                          ]);
                        }}
                        onPointerUp={() => {
                          if (drawingStroke.length > 1) {
                            updateActive({
                              strokes: [...active.strokes, drawingStroke],
                            });
                          }
                          setDrawingStroke([]);
                        }}
                      >
                        <polyline
                          points={drawingStroke
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth={1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => openPicker("image")}
                  className="flex flex-col items-center gap-2 px-8 py-16 text-white/60"
                >
                  <ImageIcon className="size-7" />
                  <span className="text-sm">Choose a photo or video</span>
                </button>
              )}

              {active && (
                <div className="absolute top-2 right-2 flex flex-col gap-1.5">
                  <ToolButton
                    label="Remove media"
                    onClick={() => removeItem(active.id)}
                  >
                    <Trash2 className="size-4" />
                  </ToolButton>
                  <ToolButton
                    label="Rotate media"
                    onClick={() =>
                      updateActive({ rotation: (active.rotation + 90) % 360 })
                    }
                  >
                    <RotateCw className="size-4" />
                  </ToolButton>
                  {active.kind === "image" && (
                    <>
                      <ToolButton
                        label={pen ? "Stop drawing" : "Draw on photo"}
                        active={pen}
                        onClick={() => setPen((value) => !value)}
                      >
                        <PenLine className="size-4" />
                      </ToolButton>
                      <ToolButton
                        label="Square crop"
                        active={active.cropSquare}
                        onClick={() =>
                          updateActive({ cropSquare: !active.cropSquare })
                        }
                      >
                        <Crop className="size-4" />
                      </ToolButton>
                    </>
                  )}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "relative size-14 shrink-0 overflow-hidden rounded-md border-2",
                      index === activeIndex ? "border-white" : "border-transparent",
                    )}
                    aria-label={`Edit attachment ${index + 1}`}
                  >
                    {item.kind === "image" ? (
                      <img
                        src={item.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center bg-white/10">
                        <Video className="size-4" />
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openPicker("image")}
                  aria-label="Add more media"
                  className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-white/30 text-white/60"
                >
                  <ImageIcon className="size-4" />
                </button>
              </div>
            )}

            {active?.kind === "video" && (
              <div className="rounded-xl bg-white/10 p-3">
                <div className="flex items-center justify-between text-[0.65rem] text-white/60">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="size-3.5" /> Trim
                  </span>
                  <span className="tabular-nums">
                    {(active.trimStart).toFixed(1)}s –{" "}
                    {Math.max(active.trimStart, active.trimEnd).toFixed(1)}s of{" "}
                    {active.duration.toFixed(1)}s
                  </span>
                </div>
                <label className="mt-2 block text-[0.6rem] text-white/50">
                  Start
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, active.duration)}
                    step={0.1}
                    value={active.trimStart}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateActive({
                        trimStart: Math.min(value, active.trimEnd - 0.2),
                      });
                    }}
                    className="mt-1 w-full accent-[var(--primary)]"
                  />
                </label>
                <label className="mt-1 block text-[0.6rem] text-white/50">
                  End
                  <input
                    type="range"
                    min={0.2}
                    max={Math.max(0.3, active.duration)}
                    step={0.1}
                    value={active.trimEnd}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      updateActive({
                        trimEnd: Math.max(value, active.trimStart + 0.2),
                      });
                    }}
                    className="mt-1 w-full accent-[var(--primary)]"
                  />
                </label>
                <p className="mt-1 flex items-center gap-1 text-[0.55rem] text-white/40">
                  <Play className="size-3" /> The trimmed range is stored with the
                  status; viewers start and stop inside it.
                </p>
              </div>
            )}

            {active?.kind === "image" && (
              <div className="space-y-2">
                <input
                  value={active.overlayText}
                  onChange={(event) =>
                    updateActive({ overlayText: event.target.value.slice(0, 200) })
                  }
                  placeholder="Text overlay (optional)"
                  className="h-10 w-full rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
                />
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <Smile className="size-4 shrink-0 text-white/50" />
                  {STICKERS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() =>
                        updateActive({
                          overlayText: `${active.overlayText}${emoji}`.slice(0, 200),
                        })
                      }
                      className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-sm"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPen((value) => !value)}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[0.62rem]",
                      pen ? "bg-white text-[#08100f]" : "bg-white/10 text-white/70",
                    )}
                  >
                    Pen
                  </button>
                  <span className="shrink-0 text-[0.6rem] text-white/50">
                    {(active.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                value={caption}
                onChange={(event) => setCaption(event.target.value.slice(0, 300))}
                placeholder="Add a caption"
                className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
              />
              <button
                type="button"
                onClick={() => setMentionOpen((open) => !open)}
                aria-label="Mention someone"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80"
              >
                <AtSign className="size-4" />
              </button>
            </div>
            {mentionOpen && (
              <ContactPicker
                contacts={contacts}
                onPick={(person) => {
                  setCaption((current) =>
                    `${current}${person.username ? `@${person.username} ` : ""}`.slice(
                      0,
                      300,
                    ),
                  );
                  setMentionOpen(false);
                }}
              />
            )}
          </div>
        )}

        {audienceOpen && (
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] p-2">
            {(Object.keys(AUDIENCE_LABELS) as AudienceMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setAudience(mode);
                  if (mode !== "only" && mode !== "contacts_except") {
                    setAudienceOpen(false);
                  }
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-white/80 hover:bg-white/10"
              >
                <span className="flex size-4 items-center justify-center">
                  {audience === mode && <Check className="size-3.5 text-primary" />}
                </span>
                {AUDIENCE_LABELS[mode]}
              </button>
            ))}

            {(audience === "only" || audience === "contacts_except") && (
              <div className="mt-1 border-t border-white/10 pt-2">
                <p className="px-1 text-[0.6rem] text-white/50">
                  {audience === "only"
                    ? "Only the selected people can see this status."
                    : "Everyone in your contacts except the selected people."}
                </p>
                {contacts.length === 0 ? (
                  <p className="mt-2 rounded-md bg-white/5 px-3 py-2 text-[0.65rem] leading-5 text-white/50">
                    You have no saved contacts yet. Open a profile and choose “Add
                    to contacts” first.
                  </p>
                ) : (
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                    {contacts.map((person) => {
                      const set = audience === "only" ? onlyIds : exceptIds;
                      const update =
                        audience === "only" ? setOnlyIds : setExceptIds;
                      const checked = set.has(person.id);
                      return (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => toggle(person.id, set, update)}
                            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-white/10"
                          >
                            <span
                              className={cn(
                                "flex size-4 items-center justify-center rounded border",
                                checked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-white/30",
                              )}
                            >
                              {checked && <Check className="size-3" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {person.display_name || person.username}
                            </span>
                            <span className="shrink-0 text-[0.6rem] text-white/40">
                              @{person.username}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {busy && (
          <div className="shrink-0">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[0.62rem] text-white/60">
              {progress < 90 ? "Uploading…" : "Publishing…"} {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg bg-destructive/20 px-3 py-2 text-xs text-red-100">
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
      </div>
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-full backdrop-blur",
        active ? "bg-white text-[#08100f]" : "bg-black/55 text-white",
      )}
    >
      {children}
    </button>
  );
}

function ContactPicker({
  contacts,
  onPick,
}: {
  contacts: Profile[];
  onPick: (person: Profile) => void;
}) {
  return (
    <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.06] p-1">
      {contacts.length === 0 ? (
        <p className="px-2 py-3 text-[0.65rem] text-white/50">
          No saved contacts to mention yet.
        </p>
      ) : (
        contacts.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => onPick(person)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
          >
            <span className="min-w-0 flex-1 truncate">
              {person.display_name || person.username}
            </span>
            <span className="shrink-0 text-[0.6rem] text-white/40">
              @{person.username}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
