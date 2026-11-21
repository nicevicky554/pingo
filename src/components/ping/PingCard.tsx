import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  Check,
  Clock,
  Loader2,
  Lock,
  MapPin,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type PingView = {
  _id: Id<"pings">;
  title: string;
  emoji: string;
  place: string;
  note: string | null;
  startsAt: number;
  closedAt: number | null;
  isHost: boolean;
  hostName: string;
  myStatus: "in" | "maybe" | "out" | null;
  counts: { in: number; maybe: number; out: number };
  attendees: { name: string; initials: string }[];
};

function whenLabel(timestamp: number) {
  const date = new Date(timestamp);
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today · ${time}`;
  if (isTomorrow(date)) return `Tomorrow · ${time}`;
  return `${format(date, "EEE d MMM")} · ${time}`;
}

const responses = [
  { status: "in" as const, label: "I'm in", icon: Check },
  { status: "maybe" as const, label: "Maybe", icon: Users },
  { status: "out" as const, label: "Can't", icon: X },
];

export function PingCard({
  ping,
  showHostControls = false,
  index = 0,
}: {
  ping: PingView;
  showHostControls?: boolean;
  index?: number;
}) {
  const respond = useMutation(api.pings.respond);
  const closePing = useMutation(api.pings.close);
  const removePing = useMutation(api.pings.remove);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isClosed = ping.closedAt !== null;
  const isOver = isPast(new Date(ping.startsAt));

  const handleRespond = async (status: "in" | "maybe" | "out") => {
    if (ping.myStatus === status) return;
    setPendingStatus(status);
    try {
      await respond({ pingId: ping._id, status });
      if (status === "in") {
        toast.success("You're in. See you there.", {
          description: ping.title,
        });
      } else if (status === "maybe") {
        toast("Marked as a maybe.", {
          description: "The tally keeps it honest.",
        });
      } else {
        toast("Noted — maybe next time.", {
          description: ping.title,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That tap didn't land.",
      );
    } finally {
      setPendingStatus(null);
    }
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      await closePing({ pingId: ping._id });
      toast.success("Ping closed. The plan is locked in.", {
        description: ping.title,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That ping wouldn't close.",
      );
    } finally {
      setClosing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await removePing({ pingId: ping._id });
      toast.success("Ping deleted.", { description: ping.title });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That ping wouldn't delete.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.25) }}
      className="flex flex-col rounded-2xl border-2 border-border bg-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-2xl">
          {ping.emoji}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {isClosed && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
              <Lock className="size-3" />
              Locked in
            </span>
          )}
          {!isClosed && isOver && (
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
              Wrapped
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
            <Clock className="size-3" />
            {whenLabel(ping.startsAt)}
          </span>
        </div>
      </div>

      <h3 className="mt-4 font-display text-xl font-bold leading-tight">
        {ping.title}
      </h3>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-3.5 shrink-0" />
        {ping.place}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        {ping.isHost ? "Your ping" : `Pinged by ${ping.hostName}`}
      </p>

      {ping.note && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-background/60 px-3.5 py-2.5 text-sm leading-6 text-muted-foreground">
          {ping.note}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        {ping.attendees.length > 0 ? (
          <div className="flex -space-x-2">
            {ping.attendees.map((attendee, attendeeIndex) => (
              <span
                key={`${ping._id}-${attendeeIndex}`}
                title={attendee.name}
                className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-foreground text-[0.6rem] font-bold text-background"
              >
                {attendee.initials}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No yeses yet</span>
        )}
        <p className="text-xs font-semibold">
          <span className="text-primary">{ping.counts.in} in</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {ping.counts.maybe} maybe
          </span>
        </p>
      </div>

      {isClosed ? (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">
          This ping is closed. The tally is final.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {responses.map((option) => {
            const selected = ping.myStatus === option.status;
            const isPending = pendingStatus === option.status;
            const Icon = option.icon;
            return (
              <button
                key={option.status}
                type="button"
                onClick={() => handleRespond(option.status)}
                disabled={pendingStatus !== null}
                aria-pressed={selected}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                  selected
                    ? option.status === "in"
                      ? "border-primary bg-primary text-primary-foreground"
                      : option.status === "maybe"
                        ? "border-foreground/25 bg-accent text-accent-foreground"
                        : "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Icon className="size-3.5" />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {showHostControls && (
        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={handleClose}
            disabled={isClosed || closing}
          >
            {closing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Lock className="size-3.5" />
            )}
            {isClosed ? "Already closed" : "Close ping"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete ping"
                className="text-muted-foreground hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{ping.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The ping and every RSVP on it disappear for good. If you just
                  want to stop new answers, close it instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete ping
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </motion.article>
  );
}
