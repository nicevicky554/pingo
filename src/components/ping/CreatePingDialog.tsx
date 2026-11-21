import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { format } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const emojiChoices = ["🌮", "🎳", "🍕", "🥾", "🎬", "☕", "🎧", "🍻", "🎨", "🏀"];

function defaultWhen() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function CreatePingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPing = useMutation(api.pings.create);
  const [emoji, setEmoji] = useState("🌮");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reset = () => {
    setEmoji("🌮");
    setTitle("");
    setPlace("");
    setWhen(defaultWhen());
    setNote("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startsAt = new Date(when).getTime();
    if (!title.trim() || title.trim().length < 2) {
      toast.error("Give your ping a name.");
      return;
    }
    if (!place.trim() || place.trim().length < 2) {
      toast.error("Add a place so people can find you.");
      return;
    }
    if (!Number.isFinite(startsAt)) {
      toast.error("Pick a date and time for the plan.");
      return;
    }

    setIsSaving(true);
    try {
      await createPing({
        title: title.trim(),
        emoji,
        place: place.trim(),
        note: note.trim() || undefined,
        startsAt,
      });
      toast.success("Your ping is on the board.", {
        description: "Now the yeses can start rolling in.",
      });
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "That ping didn't go up. Try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/15">
            <CalendarPlus className="size-5 text-primary" />
          </span>
          <DialogTitle className="font-display text-2xl font-extrabold">
            Put a plan on the board
          </DialogTitle>
          <DialogDescription>
            Keep it simple: what, where, when. Your crew does the rest with one
            tap.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              What's the plan?
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {emojiChoices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setEmoji(choice)}
                  aria-label={`Use ${choice}`}
                  aria-pressed={emoji === choice}
                  className={`flex size-9 items-center justify-center rounded-lg border-2 text-lg transition-colors ${
                    emoji === choice
                      ? "border-primary bg-primary/15"
                      : "border-transparent bg-muted hover:border-border"
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="ping-title"
              className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Plan name
            </Label>
            <Input
              id="ping-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Bowling, obviously"
              maxLength={70}
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="ping-place"
              className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              Where
            </Label>
            <Input
              id="ping-place"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Lucky Strike Lanes"
              maxLength={70}
              autoComplete="off"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="ping-when"
              className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              When
            </Label>
            <Input
              id="ping-when"
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label
              htmlFor="ping-note"
              className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              A little context <span className="font-medium lowercase">(optional)</span>
            </Label>
            <Textarea
              id="ping-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Two lanes are free. I'll book if we hit six."
              maxLength={240}
              rows={2}
            />
          </div>

          <DialogFooter className="mt-1">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Not now
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving} className="gap-2">
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              Put it on the board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
