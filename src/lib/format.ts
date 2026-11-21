import { format, isThisWeek, isToday, isYesterday } from "date-fns";

export function timeOf(iso: string) {
  return format(new Date(iso), "HH:mm");
}

export function chatListTime(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return timeOf(iso);
  if (isYesterday(date)) return "Yesterday";
  if (isThisWeek(date, { weekStartsOn: 1 })) return format(date, "EEE");
  return format(date, "dd/MM/yyyy");
}

export function dayLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMMM yyyy");
}

export function lastSeenLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return `last seen today at ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `last seen yesterday at ${format(date, "HH:mm")}`;
  return `last seen ${format(date, "d MMM")} at ${format(date, "HH:mm")}`;
}

export function durationLabel(seconds: number | null | undefined) {
  if (!seconds || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function bytesLabel(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function previewOf(body: string, kind: string) {
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "voice") return "Voice message";
  if (kind === "file") return "Attachment";
  return body || "No messages yet";
}
