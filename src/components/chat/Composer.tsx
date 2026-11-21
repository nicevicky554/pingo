import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type OutgoingMessage = {
  body: string;
  file?: File | Blob | null;
  fileName?: string;
  kind?: Message["kind"];
  durationSeconds?: number;
};

export function Composer({
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  disabled,
  disabledReason,
}: {
  onSend: (message: OutgoingMessage) => Promise<void>;
  onTyping: () => void;
  replyTo?: { message: Message; name: string } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  async function submit() {
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend({
        body,
        file,
        fileName: file?.name,
        kind: file ? (file.type.startsWith("image/") ? "image" : "file") : "text",
      });
      setText("");
      setFile(null);
      onCancelReply?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (next.size > 25 * 1024 * 1024) {
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
      chunksRef.current = [];
      cancelRef.current = false;
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const seconds = recordSeconds;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setRecordSeconds(0);
        if (timerRef.current) window.clearInterval(timerRef.current);
        if (cancelRef.current) return;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size === 0) return;
        setSending(true);
        try {
          await onSend({
            body: "",
            file: blob,
            fileName: `voice-${Date.now()}.webm`,
            kind: "voice",
            durationSeconds: Math.max(1, seconds),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice note failed to send.");
        } finally {
          setSending(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = window.setInterval(
        () => setRecordSeconds((value) => value + 1),
        1000,
      );
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings.");
    }
  }

  function stopRecording(cancel = false) {
    cancelRef.current = cancel;
    recorderRef.current?.stop();
  }

  if (disabled) {
    return (
      <div className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
        {disabledReason ?? "You cannot send messages in this conversation."}
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card px-2.5 pt-2.5 pb-2.5 sm:px-4">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-primary bg-primary/5 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[0.68rem] font-bold text-primary">
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
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
          <Paperclip className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove attachment"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {recording ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="flex-1 text-sm font-semibold">
            Recording {Math.floor(recordSeconds / 60)}:
            {String(recordSeconds % 60).padStart(2, "0")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => stopRecording(true)}
            type="button"
          >
            Cancel
          </Button>
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => stopRecording(false)}
            type="button"
            aria-label="Stop and send voice note"
          >
            <Square className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5">
          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={pickFile}
          />
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={pickFile}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Send a photo"
            className="size-10 shrink-0 text-muted-foreground"
            onClick={() => imageInput.current?.click()}
          >
            <ImageIcon className="size-[21px]" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach a file"
            className="hidden size-10 shrink-0 text-muted-foreground sm:inline-flex"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip className="size-[20px]" />
          </Button>

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
            placeholder="Write a message…"
            rows={1}
            className={cn(
              "max-h-32 min-h-10 flex-1 resize-none rounded-xl border-border bg-muted/50 py-2.5 text-sm",
              "focus-visible:ring-1",
            )}
          />

          {text.trim() || file ? (
            <Button
              type="button"
              size="icon"
              className="size-10 shrink-0 rounded-full"
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
              className="size-10 shrink-0 rounded-full"
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
