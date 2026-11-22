import { Button } from "@/components/ui/button";
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
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  Video,
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
};

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
  const draftKey = `pingo:draft:${conversationId}`;
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const imageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
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
    setText(window.sessionStorage.getItem(draftKey) ?? "");
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
    setRecordSeconds(0);
    setLivePeaks([]);
    secondsRef.current = 0;
  }

  async function submit() {
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setProgress(file ? 0 : 100);
    setError(null);
    if (file) onActivity?.("uploading");
    try {
      await onSend(
        {
          body,
          file,
          fileName: file?.name,
          kind: file
            ? file.type.startsWith("image/")
              ? "image"
              : file.type.startsWith("video/")
                ? "video"
                : "file"
            : "text",
        },
        setProgress,
      );
      setText("");
      setFile(null);
      window.sessionStorage.removeItem(draftKey);
      onCancelReply?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setSending(false);
      setProgress(0);
      onActivity?.("");
    }
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    setMenuOpen(false);
    if (!next) return;
    if (next.size > MAX_FILE) {
      setError("Attachments must be smaller than 25 MB.");
      return;
    }
    setError(null);
    setFile(next);
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
        setSending(true);
        setProgress(0);
        onActivity?.("uploading");
        try {
          await onSend(
            {
              body: "",
              file: blob,
              fileName: `voice-${Date.now()}.webm`,
              kind: "voice",
              durationSeconds: seconds,
              waveform: peaks.length > 0 ? peaks : live,
            },
            setProgress,
          );
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Voice note failed to send.",
          );
        } finally {
          setSending(false);
          setProgress(0);
          onActivity?.("");
        }
      };

      recorder.start(250);
      recorderRef.current = recorder;
      setRecording(true);
      onActivity?.("recording");
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
      setError("Microphone access was blocked. Allow it in your browser settings.");
    }
  }

  function stopRecording(cancel = false) {
    cancelRef.current = cancel;
    recorderRef.current?.stop();
  }

  const attachments = [
    { label: "Photos", icon: ImageIcon, ref: imageInput, accept: "image/*" },
    {
      label: "Camera",
      icon: Camera,
      ref: cameraInput,
      accept: "image/*",
      capture: true,
    },
    { label: "Video", icon: Video, ref: videoInput, accept: "video/*" },
    { label: "Document", icon: FileText, ref: docInput, accept: "*/*" },
    { label: "Audio", icon: AudioLines, ref: audioInput, accept: "audio/*" },
  ] as const;

  if (disabled) {
    return (
      <div className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
        {disabledReason ?? "You cannot send messages in this conversation."}
      </div>
    );
  }

  const menu = (
    <div className={cn(mobile ? "space-y-1 p-2 pb-4" : "w-56 p-1.5")}>
      {attachments.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => item.ref.current?.click()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-primary">
              <Icon className="size-4" />
            </span>
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="border-t border-border bg-card px-2 pt-2 pb-2 sm:px-3">
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={pickFile}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={pickFile}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={pickFile}
      />
      <input
        ref={docInput}
        type="file"
        className="hidden"
        onChange={pickFile}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={pickFile}
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

      {file && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-2.5 py-1.5">
          <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs">{file.name}</span>
          <span className="shrink-0 text-[0.65rem] text-muted-foreground">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove attachment"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {sending && file && (
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

          {text.trim() || file ? (
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
              onClick={() => void startRecording()}
              aria-label="Record a voice note"
            >
              <Mic className="size-[19px]" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
