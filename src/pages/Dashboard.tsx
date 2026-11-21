import { CreatePingDialog } from "@/components/ping/CreatePingDialog";
import { PingCard } from "@/components/ping/PingCard";
import { Wordmark } from "@/components/Wordmark";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  Activity,
  CalendarDays,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

type View = "pulse" | "mine" | "crew";

const navItems: {
  view: View;
  label: string;
  icon: typeof Activity;
  description: string;
}[] = [
  {
    view: "pulse",
    label: "Pulse",
    icon: Activity,
    description: "Every open ping, soonest first.",
  },
  {
    view: "mine",
    label: "My pings",
    icon: CalendarDays,
    description: "The plans you put on the board.",
  },
  {
    view: "crew",
    label: "The crew",
    icon: Users,
    description: "Everyone who can tap in.",
  },
];

function initialsFor(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("pulse");
  const [createOpen, setCreateOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  const pulse = useQuery(api.pings.pulse);
  const mine = useQuery(api.pings.mine);
  const crew = useQuery(api.pings.crew);

  const setDisplayName = useMutation(api.pings.setDisplayName);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const fallbackName = user?.email?.split("@")[0] ?? "friend";
  const displayName = user?.name?.trim() || fallbackName;
  const firstName = displayName.split(" ")[0];
  const yourYeses =
    pulse?.filter((ping) => ping.myStatus === "in").length ?? 0;

  const activeNav = navItems.find((item) => item.view === view) ?? navItems[0];

  const handleSignOut = async () => {
    try {
      await signOut();
      toast("Signed out. See you at the next ping.");
      navigate("/");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't sign you out.",
      );
    }
  };

  const openNameDialog = () => {
    setNameDraft(user?.name ?? "");
    setNameOpen(true);
    setMobileOpen(false);
  };

  const handleSaveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nameDraft.trim().length < 2) {
      toast.error("Names need at least two characters.");
      return;
    }
    setSavingName(true);
    try {
      await setDisplayName({ name: nameDraft.trim() });
      toast.success("Name updated.", {
        description: "That's what your crew will see now.",
      });
      setNameOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "That name didn't save.",
      );
    } finally {
      setSavingName(false);
    }
  };

  const countFor = (target: View) => {
    if (target === "pulse") return pulse?.length;
    if (target === "mine") return mine?.length;
    return crew?.length;
  };

  const navList = (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const count = countFor(item.view);
        const selected = view === item.view;
        return (
          <button
            key={item.view}
            type="button"
            onClick={() => {
              setView(item.view);
              setMobileOpen(false);
            }}
            aria-current={selected ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              selected
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {typeof count === "number" && (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-sidebar-accent text-muted-foreground"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const profileBlock = (
    <div className="rounded-xl border-2 border-border bg-card p-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
          {initialsFor(displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user?.isAnonymous ? "Guest session" : user?.email ?? "Signed in"}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={openNameDialog}
        >
          <Pencil className="size-3.5" />
          Edit name
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleSignOut}
          aria-label="Sign out"
          className="text-muted-foreground hover:text-destructive"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r-2 border-border bg-sidebar p-5 lg:flex">
        <Wordmark to="/dashboard" />
        <Button
          type="button"
          className="mt-6 w-full gap-1.5"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" />
          New ping
        </Button>

        <div className="mt-7">
          <p className="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Your board
          </p>
          {navList}
        </div>

        <div className="mt-auto space-y-3">
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Sparkles className="size-3.5 text-primary" />
              The whole point
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              A plan with a tally beats a group chat with a vibe.
            </p>
          </div>
          {profileBlock}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b-2 border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-r-2 border-border bg-sidebar p-0"
            >
              <SheetHeader className="border-b border-border p-5 text-left">
                <SheetTitle className="sr-only">Pingo menu</SheetTitle>
                <Wordmark to="/dashboard" />
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
                <Button
                  type="button"
                  className="w-full gap-1.5"
                  onClick={() => {
                    setCreateOpen(true);
                    setMobileOpen(false);
                  }}
                >
                  <Plus className="size-4" />
                  New ping
                </Button>
                {navList}
                <div className="mt-auto">{profileBlock}</div>
              </div>
            </SheetContent>
          </Sheet>

          <Wordmark to="/dashboard" />
          <Button
            type="button"
            size="icon"
            onClick={() => setCreateOpen(true)}
            aria-label="New ping"
          >
            <Plus className="size-5" />
          </Button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Hey, {firstName}
              </p>
              <h1 className="mt-2 font-display text-4xl font-extrabold leading-none sm:text-5xl">
                {activeNav.label}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeNav.description}
              </p>
            </div>
            <Button
              type="button"
              className="hidden gap-1.5 self-start sm:inline-flex"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" />
              New ping
            </Button>
          </motion.header>

          {view === "pulse" && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Open pings", value: pulse?.length },
                { label: "Your yeses", value: yourYeses },
                { label: "Crew", value: crew?.length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-baseline justify-between gap-2 rounded-xl border-2 border-border bg-card px-4 py-3"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {stat.label}
                  </span>
                  <span className="font-display text-2xl font-extrabold">
                    {typeof stat.value === "number" ? stat.value : "–"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8">
            {view === "pulse" && (
              <>
                {pulse === undefined ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pulse.length === 0 ? (
                  <EmptyState
                    emoji="🛎️"
                    title="No pings on the board yet."
                    copy="Be the one who starts it. A plan, a place, a time — the rest is tapping."
                    actionLabel="Start the first ping"
                    onAction={() => setCreateOpen(true)}
                  />
                ) : (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {pulse.map((ping, index) => (
                      <PingCard key={ping._id} ping={ping} index={index} />
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "mine" && (
              <>
                {mine === undefined ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : mine.length === 0 ? (
                  <EmptyState
                    emoji="🎈"
                    title="You haven't pinged anyone yet."
                    copy="The first ping is the hardest. After that, it's just a board full of yeses."
                    actionLabel="Create a ping"
                    onAction={() => setCreateOpen(true)}
                  />
                ) : (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {mine.map((ping, index) => (
                      <PingCard
                        key={ping._id}
                        ping={ping}
                        index={index}
                        showHostControls
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {view === "crew" && (
              <>
                {crew === undefined ? (
                  <div className="flex justify-center py-20">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-2xl border-2 border-border bg-card p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                            {initialsFor(displayName)}
                          </span>
                          <div>
                            <p className="font-display text-lg font-bold">
                              {user?.name?.trim() || "You, for now"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              This is how your crew sees you on every ping.
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 self-start"
                          onClick={openNameDialog}
                        >
                          <Pencil className="size-3.5" />
                          Edit name
                        </Button>
                      </div>
                    </div>

                    <ul className="divide-y divide-border overflow-hidden rounded-2xl border-2 border-border bg-card">
                      {crew.map((member) => (
                        <li
                          key={member._id}
                          className="flex items-center gap-3 px-4 py-3.5"
                        >
                          <span
                            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              member.isYou
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground"
                            }`}
                          >
                            {member.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 truncate text-sm font-bold">
                              {member.name}
                              {member.isYou && (
                                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {plural(member.rsvpCount, "answer")} given
                            </p>
                          </div>
                          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                            <UserRound className="size-3.5" />
                            {member.inCount === 1
                              ? "1 yes"
                              : `${member.inCount} yeses`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Pings on this board are visible to everyone signed in to it. Keep
            the plans kind and the guest list honest.
          </p>
        </main>
      </div>

      <CreatePingDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Dialog open={nameOpen} onOpenChange={setNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold">
              What should the crew call you?
            </DialogTitle>
            <DialogDescription>
              This name shows up on the board and next to every RSVP.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveName} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Sam Rivera"
                maxLength={40}
                autoComplete="name"
                required
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={savingName} className="gap-2">
                {savingName && <Loader2 className="size-4 animate-spin" />}
                Save name
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  emoji,
  title,
  copy,
  actionLabel,
  onAction,
}: {
  emoji: string;
  title: string;
  copy: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="dot-grid flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-accent text-3xl">
        {emoji}
      </span>
      <h2 className="mt-5 font-display text-2xl font-extrabold">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {copy}
      </p>
      <Button type="button" className="mt-6 gap-1.5" onClick={onAction}>
        <Plus className="size-4" />
        {actionLabel}
      </Button>
    </div>
  );
}
