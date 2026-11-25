import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AudioLines,
  Camera,
  Check,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Mic,
  Pause,
  Paperclip,
  Play,
  PlayCircle,
  Send,
  Smile,
  Square,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type OutgoingMessage = {
  body: string;
  file?: File | Blob | null;
  fileName?: string;
  kind?: Message["kind"];
  durationSeconds?: number;
  waveform?: number[];
  viewOnce?: boolean;
};

type PickedAttachment = {
  id: string;
  file: File;
  url: string | null;
  kind: "image" | "video" | "file" | "voice";
  duration?: number;
};

function mediaDuration(seconds: number | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const MAX_FILE = 25 * 1024 * 1024;
const BAR_COUNT = 40;

/** Derive peaks from the actual recorded audio samples. */
async function extractPeaks(blob: Blob): Promise<number[]> {
  try {
    const context = new AudioContext();
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0);
    const block = Math.floor(data.length / BAR_COUNT) || 1;
    const raw: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) sum += Math.abs(data[start + j] ?? 0);
      raw.push(sum / block);
    }
    await context.close();
    const max = Math.max(...raw, 0.0001);
    return raw.map((value) => Math.max(4, Math.round((value / max) * 100)));
  } catch {
    return [];
  }
}

export function Composer({
  conversationId,
  onSend,
  onTyping,
  onActivity,
  replyTo,
  onCancelReply,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  onSend: (
    message: OutgoingMessage,
    onProgress: (percent: number) => void,
  ) => Promise<void>;
  onTyping: () => void;
  onActivity?: (activity: "" | "recording" | "uploading") => void;
  replyTo?: { message: Message; name: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const mobile = useIsMobile();
  const { profile: me } = useAuth();
  const draftKey = `pingo:draft:${conversationId}`;
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [previewItem, setPreviewItem] = useState<PickedAttachment | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingCount, setSendingCount] = useState(0);
  const sendingRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [holding, setHolding] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const holdStartRef = useRef<{ x: number; y: number } | null>(null);
  const holdReleasedRef = useRef(false);
  const suppressMicClickRef = useRef(false);
  const [pendingVoice, setPendingVoice] = useState<{
    blob: Blob;
    url: string;
    seconds: number;
    peaks: number[];
  } | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const sampleRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const peaksRef = useRef<number[]>([]);
  const cancelRef = useRef(false);

  useEffect(() => {
    void Promise.resolve().then(() =>
      setText(window.sessionStorage.getItem(draftKey) ?? ""),
    );
  }, [draftKey]);

  useEffect(() => {
    if (text) window.sessionStorage.setItem(draftKey, text);
    else window.sessionStorage.removeItem(draftKey);
  }, [draftKey, text]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (sampleRef.current) window.clearInterval(sampleRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      void contextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  function resetRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (sampleRef.current) window.clearInterval(sampleRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    analyserRef.current = null;
    setRecording(false);
    setRecordingPaused(false);
    setRecordSeconds(0);
    setLivePeaks([]);
    secondsRef.current = 0;
  }

  async function submit() {
    const body = text.trim();
    if ((!body && attachments.length === 0) || sendingRef.current) return;
    sendingRef.current = true;
    const selected = [...attachments];
    const sendAsViewOnce = viewOnce;
    setSending(true);
    setSendingCount(selected.length);
    setProgress(selected.length > 0 ? 0 : 100);
    setError(null);
    // Clear immediately; optimistic messages are already in the thread and keep
    // their own blob for retry.
    setText("");
    setAttachments([]);
    setViewOnce(false);
    window.sessionStorage.removeItem(draftKey);
    if (selected.length > 0) onActivity?.("uploading");
    try {
      if (selected.length === 0) {
        await onSend({ body, kind: "text" }, setProgress);
      } else {
        for (const [index, attachment] of selected.entries()) {
          await onSend(
            {
              body: index === 0 ? body : "",
              file: attachment.file,
              fileName: attachment.file.name,
              kind: attachment.kind === "voice" ? "file" : attachment.kind,
              durationSeconds:
                attachment.kind === "video" ? attachmentDuration(attachment) : undefined,
              viewOnce:
                sendAsViewOnce &&
                (attachment.kind === "image" || attachment.kind === "video"),
            },
            (percent) =>
              setProgress(
                Math.round(((index + percent / 100) / selected.length) * 100),
              ),
          );
        }
      }
      for (const attachment of selected) {
        if (attachment.url) URL.revokeObjectURL(attachment.url);
      }
      onCancelReply?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendingCount(0);
      setProgress(0);
      onActivity?.("");
    }
  }

  function attachmentDuration(attachment: PickedAttachment) {
    return attachment.duration && attachment.duration > 0
      ? Math.round(attachment.duration)
      : undefined;
  }

  function pickFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    setMenuOpen(false);
    if (next.length === 0) return;
    const tooLarge = next.find((item) => item.size > MAX_FILE);
    if (tooLarge) {
      setError(`${tooLarge.name} is larger than 25 MB.`);
      return;
    }
    setError(null);
    setAttachments((current) => {
      const seen = new Set(current.map((item) => `${item.file.name}:${item.file.size}`));
      const picked: PickedAttachment[] = next
        .filter((item) => !seen.has(`${item.name}:${item.size}`))
        .map((item) => ({
          id: crypto.randomUUID(),
          file: item,
          url:
            item.type.startsWith("image/") || item.type.startsWith("video/")
              ? URL.createObjectURL(item)
              : null,
          kind: item.type.startsWith("image/")
            ? "image"
            : item.type.startsWith("video/")
              ? "video"
              : item.type.startsWith("audio/")
                ? "voice"
                : "file",
        }));
      return [...current, ...picked].slice(0, 10);
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function shareLocation() {
    setMenuOpen(false);
    if (!navigator.geolocation) {
      setError("This browser cannot read your location.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const link = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        try {
          await onSend(
            { body: `Live location: ${link}`, kind: "text" },
            () => undefined,
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : "Location could not be sent.");
        }
      },
      () => setError("Location permission was denied."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function openContacts() {
    setMenuOpen(false);
    setContactOpen(true);
    if (!me || contacts.length > 0) return;
    setContactsLoading(true);
    const { data: rows } = await supabase
      .from("contacts")
      .select("contact_id")
      .eq("owner_id", me.id)
      .limit(200);
    const ids = (rows ?? []).map((row) => (row as { contact_id: string }).contact_id);
    if (ids.length > 0) {
      const { data: people } = await supabase
        .from("public_profiles")
        .select("*")
        .in("id", ids);
      setContacts((people ?? []) as Profile[]);
    }
    setContactsLoading(false);
  }

  async function sendContact(person: Profile) {
    const name = person.display_name || person.username || "PINGO user";
    setContactOpen(false);
    try {
      await onSend(
        {
          body: `Contact: ${name}${person.username ? ` (@${person.username})` : ""}`,
          kind: "text",
        },
        () => undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contact could not be sent.");
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      peaksRef.current = [];
      cancelRef.current = false;
      setLivePeaks([]);
      setRecordSeconds(0);
      secondsRef.current = 0;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const seconds = Math.max(1, secondsRef.current);
        const live = [...peaksRef.current];
        const wasCancelled = cancelRef.current;
        resetRecording();
        onActivity?.("");
        if (wasCancelled) return;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size === 0) return;
        const peaks = await extractPeaks(blob);
        setPendingVoice({
          blob,
          url: URL.createObjectURL(blob),
          seconds,
          peaks: peaks.length > 0 ? peaks : live,
        });
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      onActivity?.("recording");
      // The permission prompt can outlive the touch gesture; if the user has
      // already released, do not leave an orphaned recording running.
      if (holdReleasedRef.current) {
        stopRecording(false);
        return;
      }
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setRecordSeconds(secondsRef.current);
      }, 1000);

      const buffer = new Uint8Array(analyser.fftSize);
      sampleRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const value = (buffer[i] - 128) / 128;
          sum += value * value;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const peak = Math.min(100, Math.max(4, Math.round(rms * 320)));
        peaksRef.current = [...peaksRef.current.slice(-(BAR_COUNT - 1)), peak];
        setLivePeaks([...peaksRef.current]);
      }, 120);
    } catch {
      setHolding(false);
      setLocked(false);
      setCancelArmed(false);
      setError("Microphone access was blocked. Allow it in your browser settings.");
    }
  }

  function stopRecording(cancel = false) {
    cancelRef.current = cancel;
    setHolding(false);
    setLocked(false);
    setCancelArmed(false);
    holdStartRef.current = null;
    recorderRef.current?.stop();
  }

  // Touch gestures while the recording row replaces the composer:
  // slide up to lock hands-free, slide left to cancel, release to stop.
  useEffect(() => {
    if (!holding) return;
    const move = (event: PointerEvent) => {
      const start = holdStartRef.current;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (dy < -56) setLocked(true);
      setCancelArmed(dx < -80 && Math.abs(dx) > Math.abs(dy));
    };
    const end = () => {
      setHolding(false);
      holdReleasedRef.current = true;
      holdStartRef.current = null;
      if (!recorderRef.current) return;
      if (cancelArmed) {
        stopRecording(true);
        return;
      }
      // A locked recording keeps running until the user taps stop.
      if (!locked) stopRecording(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [holding, locked, cancelArmed]);

  function toggleRecordingPause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (sampleRef.current) window.clearInterval(sampleRef.current);
      setRecordingPaused(true);
      return;
    }
    if (recorder.state === "paused") {
      recorder.resume();
      setRecordingPaused(false);
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setRecordSeconds(secondsRef.current);
      }, 1000);
      const analyser = analyserRef.current;
      if (analyser) {
        const buffer = new Uint8Array(analyser.fftSize);
        sampleRef.current = window.setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            const value = (buffer[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / buffer.length);
          const peak = Math.min(100, Math.max(4, Math.round(rms * 320)));
          peaksRef.current = [...peaksRef.current.slice(-(BAR_COUNT - 1)), peak];
          setLivePeaks([...peaksRef.current]);
        }, 120);
      }
    }
  }

  const attachOptions = [
    { label: "Gallery", hint: "Photos and videos", icon: ImageIcon, ref: imageInput },
    {
      label: "Camera",
      hint: "Take a photo",
      icon: Camera,
      ref: cameraInput,
    },
    { label: "Document", hint: "Any file up to 25 MB", icon: FileText, ref: docInput },
    { label: "Audio", hint: "Music or a recording", icon: AudioLines, ref: audioInput },
  ] as const;

  useEffect(() => {
    return () => {
      for (const item of attachments) {
        if (item.url) URL.revokeObjectURL(item.url);
      }
    };
    // Only on unmount; individual removals revoke their own URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (disabled) {
    return (
      <div className="glass mx-2 mb-2 rounded-xl px-4 py-3 text-center text-xs text-muted-foreground">
        {disabledReason ?? "You cannot send messages in this conversation."}
      </div>
    );
  }

  const menu = (
    <div className={cn(mobile ? "grid grid-cols-2 gap-1 p-3 pb-6" : "w-64 p-1.5")}>
      {attachOptions.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => item.ref.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block truncate text-[0.62rem] text-muted-foreground">
                {item.hint}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => void shareLocation()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <MapPin className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Location</span>
          <span className="block truncate text-[0.62rem] text-muted-foreground">
            Share where you are
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void openContacts()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          <UserRound className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Contact</span>
          <span className="block truncate text-[0.62rem] text-muted-foreground">
            Share a saved contact
          </span>
        </span>
      </button>
    </div>
  );

  return (
    <div className="glass safe-bottom mx-2 mb-2 rounded-xl px-2 pt-2 pb-2 sm:mx-3">
      <input
        ref={imageInput}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={pickFiles}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pickFiles}
      />

      <input
        ref={docInput}
        type="file"
        className="hidden"
        onChange={pickFiles}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={pickFiles}
      />

      {replyTo && (
        <div className="mb-2 flex items-start gap-2 border-l-2 border-primary bg-secondary/60 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-semibold text-primary">
              Replying to {replyTo.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {replyTo.message.body || "Attachment"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-2 rounded-lg border border-border bg-secondary/40 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold">
              {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="text-[0.65rem] font-medium text-primary"
            >
              Add more
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => setPreviewItem(attachment)}
                  className="size-full"
                  aria-label={`Preview ${attachment.file.name}`}
                >
                  {attachment.kind === "image" && attachment.url ? (
                    <img
                      src={attachment.url}
                      alt={attachment.file.name}
                      className="size-full object-cover"
                    />
                  ) : attachment.kind === "video" && attachment.url ? (
                    <span className="relative block size-full bg-black">
                      <video
                        src={attachment.url}
                        className="size-full object-cover"
                        preload="metadata"
                        muted
                        onLoadedMetadata={(event) => {
                          const duration = event.currentTarget.duration;
                          if (!Number.isFinite(duration)) return;
                          setAttachments((current) =>
                            current.map((entry) =>
                              entry.id === attachment.id
                                ? { ...entry, duration }
                                : entry,
                            ),
                          );
                        }}
                      />
                      <PlayCircle className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow" />
                    </span>
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
                      <FileText className="size-4" />
                      <span className="line-clamp-2 text-center text-[0.55rem]">
                        {attachment.file.name}
                      </span>
                    </span>
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[0.5rem] font-semibold text-white">
                    {mediaDuration(attachment.duration) ??
                      `${(attachment.file.size / 1024 / 1024).toFixed(1)} MB`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  aria-label={`Remove ${attachment.file.name}`}
                  className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          {attachments.some(
            (item) => item.kind === "image" || item.kind === "video",
          ) && (
            <button
              type="button"
              aria-pressed={viewOnce}
              onClick={() => setViewOnce((value) => !value)}
              className={cn(
                "mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border py-1 text-[0.62rem] font-medium",
                viewOnce
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <Eye className="size-3.5" />
              {viewOnce ? "View once enabled" : "Send view once"}
            </button>
          )}
        </div>
      )}

      {pendingVoice && !recording && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-secondary/60 px-2 py-2">
          <audio
            ref={voiceAudioRef}
            src={pendingVoice.url}
            className="hidden"
            onTimeUpdate={(event) => {
              const audio = event.currentTarget;
              setVoiceProgress(
                audio.duration ? audio.currentTime / audio.duration : 0,
              );
            }}
            onEnded={() => {
              setVoicePlaying(false);
              setVoiceProgress(0);
            }}
          />
          <button
            type="button"
            onClick={() => {
              const audio = voiceAudioRef.current;
              if (!audio) return;
              if (audio.paused) {
                void audio.play();
                setVoicePlaying(true);
              } else {
                audio.pause();
                setVoicePlaying(false);
              }
            }}
            aria-label={voicePlaying ? "Pause voice note" : "Play voice note"}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            {voicePlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          </button>
          <button
            type="button"
            className="flex h-8 min-w-0 flex-1 items-center gap-[2px]"
            aria-label="Seek voice note"
            onClick={(event) => {
              const audio = voiceAudioRef.current;
              if (!audio || !audio.duration) return;
              const rect = event.currentTarget.getBoundingClientRect();
              audio.currentTime =
                ((event.clientX - rect.left) / rect.width) * audio.duration;
            }}
          >
            {(pendingVoice.peaks.length > 0
              ? pendingVoice.peaks
              : Array.from({ length: BAR_COUNT }, () => 20)
            ).map((peak, index, all) => (
              <span
                key={index}
                className={cn(
                  "w-[2px] shrink-0 rounded-full",
                  index / all.length <= voiceProgress
                    ? "bg-primary"
                    : "bg-muted-foreground/40",
                )}
                style={{ height: `${Math.max(4, (peak / 100) * 26)}px` }}
              />
            ))}
          </button>
          <span className="shrink-0 text-[0.65rem] tabular-nums text-muted-foreground">
            {Math.floor(pendingVoice.seconds / 60)}:
            {String(pendingVoice.seconds % 60).padStart(2, "0")}
          </span>
          <button
            type="button"
            onClick={() => {
              voiceAudioRef.current?.pause();
              URL.revokeObjectURL(pendingVoice.url);
              setPendingVoice(null);
              setVoicePlaying(false);
              setVoiceProgress(0);
            }}
            aria-label="Discard voice note"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <Button
            size="icon"
            className="size-8 shrink-0 rounded-full"
            aria-label="Send voice note"
            disabled={sending}
            onClick={async () => {
              setSending(true);
              setProgress(0);
              onActivity?.("uploading");
              try {
                await onSend(
                  {
                    body: "",
                    file: pendingVoice.blob,
                    fileName: `voice-${Date.now()}.webm`,
                    kind: "voice",
                    durationSeconds: pendingVoice.seconds,
                    waveform: pendingVoice.peaks,
                  },
                  setProgress,
                );
                URL.revokeObjectURL(pendingVoice.url);
                setPendingVoice(null);
              } catch (err) {
                const raw = err instanceof Error ? err.message : "";
                // The optimistic chat bubble holds the recording and exposes a
                // single Retry action, so clearing the duplicate preview cannot
                // lose it or allow a double send.
                URL.revokeObjectURL(pendingVoice.url);
                setPendingVoice(null);
                setVoicePlaying(false);
                setVoiceProgress(0);
                setError(
                  /row-level security|unauthori[sz]ed|new row|row-level/i.test(raw)
                    ? "The voice note could not be sent. Tap Retry on the message in the chat — the recording is kept there."
                    : raw || "Voice note failed to send. Tap Retry on the message.",
                );
              } finally {
                setSending(false);
                setProgress(0);
                onActivity?.("");
              }
            }}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      )}

      {sending && (sendingCount > 0 || pendingVoice) && (
        <div className="mb-2">
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
        <p className="mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {recording ? (
        <>
          {(holding || locked) && (
            <p
              className={cn(
                "mb-1 text-center text-[0.65rem] font-medium",
                cancelArmed ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {cancelArmed
                ? "Release to cancel"
                : locked
                  ? "Recording locked — tap stop to review"
                  : "Slide up to lock · slide left to cancel"}
            </p>
          )}
        <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="shrink-0 text-xs font-medium tabular-nums">
            {Math.floor(recordSeconds / 60)}:
            {String(recordSeconds % 60).padStart(2, "0")}
          </span>
          <span className="flex h-7 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
            {livePeaks.length === 0
              ? Array.from({ length: 24 }).map((_, index) => (
                  <span
                    key={index}
                    className="w-[2px] rounded-full bg-muted-foreground/30"
                    style={{ height: 4 }}
                  />
                ))
              : livePeaks.map((peak, index) => (
                  <span
                    key={index}
                    className="w-[2px] shrink-0 rounded-full bg-primary/70"
                    style={{ height: `${Math.max(4, (peak / 100) * 26)}px` }}
                  />
                ))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={toggleRecordingPause}
            type="button"
            aria-label={recordingPaused ? "Resume recording" : "Pause recording"}
          >
            {recordingPaused ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-xs"
            onClick={() => stopRecording(true)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            size="icon"
            className="size-8 shrink-0 rounded-full"
            onClick={() => stopRecording(false)}
            type="button"
            aria-label="Stop and send voice note"
          >
            <Square className="size-3.5" />
          </Button>
        </div>
        </>
      ) : (
        <div className="flex items-end gap-1">
          {mobile ? (
            <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
              <DrawerTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach"
                  className="size-9 shrink-0 text-muted-foreground"
                >
                  <Paperclip className="size-[20px]" />
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerTitle className="px-4 pt-2 text-sm font-semibold">
                  Attach
                </DrawerTitle>
                {menu}
              </DrawerContent>
            </Drawer>
          ) : (
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach"
                  className="size-9 shrink-0 text-muted-foreground"
                >
                  <Paperclip className="size-[20px]" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="p-0">
                {menu}
              </PopoverContent>
            </Popover>
          )}

          <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Emoji"
                className="size-9 shrink-0 text-muted-foreground"
              >
                <Smile className="size-[20px]" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-auto p-0">
              <EmojiPicker
                onSelect={(emoji) => {
                  setText((current) => current + emoji);
                  textareaRef.current?.focus();
                }}
              />
            </PopoverContent>
          </Popover>

          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value) onTyping();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Message"
            rows={1}
            className={cn(
              "max-h-28 min-h-9 flex-1 resize-none rounded-lg border-transparent bg-secondary px-3 py-2 text-[0.86rem] field-sizing-content focus-visible:border-input focus-visible:ring-1",
            )}
          />

          {text.trim() || attachments.length > 0 ? (
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              onClick={() => void submit()}
              disabled={sending}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-[18px]" />
              )}
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              onPointerDown={(event) => {
                if (event.pointerType === "mouse") return;
                suppressMicClickRef.current = true;
                holdReleasedRef.current = false;
                holdStartRef.current = { x: event.clientX, y: event.clientY };
                setLocked(false);
                setCancelArmed(false);
                setHolding(true);
                void startRecording();
              }}
              onClick={() => {
                if (suppressMicClickRef.current) {
                  suppressMicClickRef.current = false;
                  return;
                }
                void startRecording();
              }}
              onContextMenu={(event) => event.preventDefault()}
              aria-label="Record a voice note"
            >
              <Mic className="size-[19px]" />
            </Button>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(previewItem)}
        onOpenChange={(open) => {
          if (!open) setPreviewItem(null);
        }}
      >
        <DialogContent className="max-w-3xl border-0 bg-black/95 p-0 text-white">
          <DialogTitle className="sr-only">Attachment preview</DialogTitle>
          <div className="flex items-center justify-between px-3 py-2">
            <p className="min-w-0 truncate text-xs text-white/80">
              {previewItem?.file.name}
            </p>
            <button
              type="button"
              onClick={() => setPreviewItem(null)}
              aria-label="Close preview"
              className="rounded-md p-1.5 text-white/80 hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex max-h-[75dvh] items-center justify-center overflow-hidden p-2">
            {previewItem?.kind === "image" && previewItem.url ? (
              <img
                src={previewItem.url}
                alt={previewItem.file.name}
                className="max-h-[70dvh] w-auto max-w-full object-contain"
              />
            ) : previewItem?.kind === "video" && previewItem.url ? (
              <video
                src={previewItem.url}
                controls
                autoPlay
                className="max-h-[70dvh] w-full rounded-md"
              />
            ) : previewItem ? (
              <div className="px-6 py-10 text-center text-sm text-white/70">
                {previewItem.file.name} ·{" "}
                {(previewItem.file.size / 1024).toFixed(0)} KB
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Share a contact</DialogTitle>
          {contactsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="py-6 text-center text-xs leading-5 text-muted-foreground">
              You have no saved contacts yet. Open a profile and choose "Add to
              contacts" first.
            </p>
          ) : (
            <div className="thin-scrollbar max-h-80 overflow-y-auto">
              {contacts.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => void sendContact(person)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-secondary"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                    {(person.display_name || person.username || "P")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {person.display_name || person.username}
                    </span>
                    <span className="block truncate text-[0.65rem] text-muted-foreground">
                      @{person.username}
                    </span>
                  </span>
                  <Check className="size-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
