import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { STATUS_FONTS, type StatusFont } from "@/lib/status";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  RotateCw,
  Type,
  Video,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

const BACKGROUNDS = [
  "#147D80",
  "#174C46",
  "#1D3A4A",
  "#2B2F36",
  "#5A3F2E",
  "#3C4A2F",
];

type StatusAlign = "left" | "center" | "right";
const TEXT_COLORS = ["#FFFFFF", "#FDE68A", "#A7F3D0", "#BAE6FD", "#FBCFE8"];
const QUICK_EMOJI = ["😀", "😂", "😍", "🔥", "🙏", "🎉", "❤️", "👍"];

type Kind = "text" | "image" | "video";
type AudienceMode = "contacts" | "contacts_except" | "only" | "everyone" | "nobody";

const AUDIENCE_LABELS: Record<AudienceMode, string> = {
  contacts: "My contacts",
  contacts_except: "My contacts except…",
  only: "Only share with…",
  everyone: "Everyone",
  nobody: "Only me",
};

export default function StatusComposerPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [kind, setKind] = useState<Kind>("text");
  const [body, setBody] = useState("");
  const [caption, setCaption] = useState("");
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [font, setFont] = useState<StatusFont>("sans");
  const [align, setAlign] = useState<StatusAlign>("center");
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [media, setMedia] = useState<
    { file: File; url: string; kind: "image" | "video"; rotation: number }[]
  >([]);
  const [audience, setAudience] = useState<AudienceMode>("contacts");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [exceptIds, setExceptIds] = useState<Set<string>>(new Set());
  const [onlyIds, setOnlyIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    let active = true;
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
      if (!active) return;

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
        new Set(rows.filter((row) => row.rule === "except").map((row) => row.viewer_id)),
      );
      setOnlyIds(
        new Set(rows.filter((row) => row.rule === "only").map((row) => row.viewer_id)),
      );

      const ids = (saved ?? []).map(
        (row: { contact_id: string }) => row.contact_id,
      );
      if (ids.length > 0) {
        const { data: people } = await supabase
          .from("public_profiles")
          .select("*")
          .in("id", ids);
        if (active) setContacts((people ?? []) as Profile[]);
      }
    })();
    return () => {
      active = false;
    };
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
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  useEffect(() => {
    return () => {
      for (const item of mediaRef.current) URL.revokeObjectURL(item.url);
    };
  }, []);

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
    if (kind !== "text" && media.length === 0) {
      setError("Choose at least one photo or video to share.");
      return;
    }
    if (audience === "only" && onlyIds.size === 0) {
      setError("Choose at least one person to share this status with.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: settingsError } = await supabase
        .from("user_settings")
        .update({ status_visibility: audience })
        .eq("user_id", profile.id);
      if (settingsError) throw settingsError;

      // Replace both audience rule sets so switching modes cannot leave stale
      // grants behind.
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

        const row = {
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
        };
        const styled =
          entry.kind === "text"
            ? { ...row, font, text_align: align, text_color: textColor }
            : row;
        let { error: insertError } = await supabase
          .from("status_updates")
          .insert(styled);
        // Migration 0018 adds the text style columns; publish without them
        // rather than failing when it has not been applied yet.
        if (insertError && styled !== row && /column/i.test(insertError.message)) {
          ({ error: insertError } = await supabase
            .from("status_updates")
            .insert(row));
        }
        if (insertError) throw insertError;
      }
      for (const item of media) URL.revokeObjectURL(item.url);
      navigate("/app/updates", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The status could not be shared.",
      );
    } finally {
      setBusy(false);
    }
  }

  const audiencePeople =
    audience === "only"
      ? contacts.filter((person) => onlyIds.has(person.id))
      : contacts.filter((person) => exceptIds.has(person.id));
  const audienceCount = audiencePeople.length;

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
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => void publish()}
          disabled={busy}
        >
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
              <p
                className="max-h-[300px] w-full overflow-y-auto text-xl leading-8 font-medium break-words whitespace-pre-wrap"
                style={{
                  fontFamily: STATUS_FONTS[font],
                  textAlign: align,
                  color: textColor,
                }}
              >
                {body || "Type your status…"}
              </p>
            </div>
          ) : media.length > 0 ? (
            <div
              className={cn(
                "grid w-full gap-2",
                media.length === 1 ? "grid-cols-1" : "grid-cols-2",
              )}
            >
              {media.map((item) => (
                <div
                  key={item.url}
                  className="relative overflow-hidden rounded-xl bg-black"
                >
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
                            ? { ...entry, rotation: (entry.rotation + 90) % 360 }
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
              {kind === "video" ? (
                <Video className="size-7" />
              ) : (
                <ImageIcon className="size-7" />
              )}
              <span className="text-sm">
                Choose {kind === "video" ? "a video" : "a photo"}
              </span>
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
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(STATUS_FONTS) as StatusFont[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFont(key)}
                    aria-pressed={font === key}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs capitalize",
                      font === key ? "bg-white text-[#0d151c]" : "bg-white/10 text-white/80",
                    )}
                    style={{ fontFamily: STATUS_FONTS[key] }}
                  >
                    {key}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-white/20" aria-hidden />
                {(["left", "center", "right"] as const).map((value) => {
                  const Icon =
                    value === "left" ? AlignLeft : value === "right" ? AlignRight : AlignCenter;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAlign(value)}
                      aria-label={`Align ${value}`}
                      aria-pressed={align === value}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full",
                        align === value ? "bg-white text-[#0d151c]" : "bg-white/10",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.65rem] text-white/50">Text</span>
                {TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setTextColor(color)}
                    aria-label={`Text colour ${color}`}
                    className={cn(
                      "size-6 rounded-full border-2",
                      textColor === color ? "border-white" : "border-white/20",
                    )}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setBody((current) => (current + emoji).slice(0, 700))}
                    aria-label={`Insert ${emoji}`}
                    className="flex size-8 items-center justify-center rounded-full text-lg hover:bg-white/10"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
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

          <div className="rounded-lg bg-white/10">
            <button
              type="button"
              onClick={() => setAudienceOpen((open) => !open)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-xs"
            >
              <span className="text-white/60">Who can see this</span>
              <span className="flex items-center gap-1.5 font-medium text-white">
                {AUDIENCE_LABELS[audience]}
                {audienceCount > 0 && (
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[0.6rem]">
                    {audienceCount}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    audienceOpen && "rotate-180",
                  )}
                />
              </span>
            </button>

            {audienceOpen && (
              <div className="border-t border-white/10 px-2 py-2">
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
              </div>
            )}

            {(audience === "only" || audience === "contacts_except") && (
              <div className="border-t border-white/10 px-3 py-3">
                <p className="text-[0.65rem] text-white/50">
                  {audience === "only"
                    ? "Only the people you select can see this status."
                    : "Everyone in your contacts except the people you select."}
                </p>
                {contacts.length === 0 ? (
                  <p className="mt-2 rounded-md bg-white/5 px-3 py-2 text-[0.68rem] leading-5 text-white/50">
                    You have no saved contacts yet. Open a profile and choose
                    “Add to contacts” first.
                  </p>
                ) : (
                  <ul className="mt-2 max-h-44 space-y-0.5 overflow-y-auto">
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
                            <span className="shrink-0 text-[0.62rem] text-white/40">
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
          <p className="text-[0.65rem] text-white/40">
            Statuses expire after 24 hours.
          </p>
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
