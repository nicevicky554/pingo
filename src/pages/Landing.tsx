import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Wordmark } from "@/components/Wordmark";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  Clock,
  Hand,
  MapPin,
  PartyPopper,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.55 },
};

const marqueeWords = [
  "Ping it",
  "Tap in",
  "Show up",
  "No maybe limbo",
  "Bring your people",
  "That's a bingo",
];

const steps = [
  {
    number: "1",
    title: "Ping it",
    icon: CalendarPlus,
    copy: "Pick the plan, the place, and a time. One card goes up on the board — no calendar tetris, no 30-message negotiation.",
  },
  {
    number: "2",
    title: "Everyone taps in",
    icon: Hand,
    copy: "Your crew answers with one tap: I'm in, Maybe, or Can't. The tally updates live, so nobody has to chase a headcount.",
  },
  {
    number: "3",
    title: "It actually happens",
    icon: PartyPopper,
    copy: "You can see who's in before you book the table. Close the ping when it's locked, and go be people in a room.",
  },
];

const features = [
  {
    icon: Zap,
    title: "Two taps, zero excuses",
    copy: "No forms, no polls, no “let me check my calendar and get back to you.” One tap and the plan has a pulse.",
  },
  {
    icon: Users,
    title: "One board for the whole crew",
    copy: "Every open plan lives in the same place. No scrolling back through three group chats to find the address.",
  },
  {
    icon: Clock,
    title: "A tally that settles it",
    copy: "Four in, two maybes, one out. You'll know if it's worth booking a table before you put your name down.",
  },
  {
    icon: Sparkles,
    title: "No password maze",
    copy: "Sign in with a six-digit email code or jump straight in as a guest. The plan is the point, not the login.",
  },
];

const samplePings = [
  {
    emoji: "🌮",
    title: "Taco crawl on the east side",
    host: "Maya",
    when: "Saturday · 6:30 PM",
    place: "La Cocina → El Farolito",
    in: 7,
    maybe: 3,
    tint: "bg-accent",
  },
  {
    emoji: "🎳",
    title: "Bowling, obviously",
    host: "Dev",
    when: "Thursday · 7:30 PM",
    place: "Lucky Strike Lanes",
    in: 5,
    maybe: 2,
    tint: "bg-secondary",
  },
  {
    emoji: "🥾",
    title: "Sunrise ridge hike",
    host: "Noor",
    when: "Sunday · 6:00 AM",
    place: "Twin Peaks trailhead",
    in: 3,
    maybe: 1,
    tint: "bg-primary/15",
  },
];

const notes = [
  {
    quote:
      "Our group chat went from 400 messages to one ping. Four of us actually showed up.",
    name: "Maya R.",
    crew: "The Sunday Crew",
    initials: "MR",
  },
  {
    quote:
      "I stopped being the plans person. Now I send a ping and everyone taps in or taps out.",
    name: "Devon K.",
    crew: "Third Floor Gang",
    initials: "DK",
  },
  {
    quote:
      "The Maybe button is the politest lie detector I have ever used.",
    name: "Noor A.",
    crew: "Run Club (allegedly)",
    initials: "NA",
  },
];

const questions = [
  {
    q: "Is Pingo free?",
    a: "Yes. Creating pings, tapping in, and keeping the board are free for your crew. No card, no trial countdown.",
  },
  {
    q: "Do I have to be the planner?",
    a: "Nope. Anyone in the crew can put a ping on the board. The person who asks picks the place, and everyone else decides with one tap.",
  },
  {
    q: "What if people only answer “maybe”?",
    a: "The board shows maybes honestly, so you can decide whether a maybe-heavy plan is worth holding. You can also close a ping once the yeses are enough.",
  },
  {
    q: "Can I use it for a bigger crowd?",
    a: "Pingo is built for the people you actually want to see — think three to thirty. It works for a birthday table or a recurring run club, not a conference.",
  },
  {
    q: "How do I sign in?",
    a: "We email you a six-digit code, or you can continue as a guest if you just want to see the board. No password to invent or forget.",
  },
];

function AvatarRow({ highlightAll = false }: { highlightAll?: boolean }) {
  const people = ["MR", "DK", "NA", "JL", "SC"];
  return (
    <div className="flex -space-x-2">
      {people.map((initials, index) => (
        <span
          key={initials}
          className={`flex size-8 items-center justify-center rounded-full border-2 border-card text-[0.6rem] font-bold ${
            highlightAll || index < 3
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {initials}
        </span>
      ))}
      <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-[0.6rem] font-bold text-primary-foreground">
        +4
      </span>
    </div>
  );
}

function PreviewCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotate: 3 }}
      animate={{ opacity: 1, y: 0, rotate: 1 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="relative z-10 w-full rounded-[1.75rem] border-2 border-border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          Ping board · live
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
          <Clock className="size-3" />
          Thursday
        </span>
      </div>

      <div className="mt-5 flex items-start gap-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-3xl">
          🎳
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-2xl font-bold leading-tight">
            Bowling, obviously
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            Lucky Strike Lanes · 7:30 PM
          </p>
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 px-3.5 py-2.5 text-sm text-muted-foreground">
        “Two lanes are free. I'll book if we hit six.”
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="flex items-center justify-center gap-1.5 rounded-lg border-2 border-primary bg-primary px-2 py-2.5 text-xs font-bold text-primary-foreground">
          <Check className="size-3.5" /> I'm in
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2.5 text-xs font-semibold">
          Maybe
        </div>
        <div className="flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2.5 text-xs font-semibold text-muted-foreground">
          Can't
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <AvatarRow />
        <div className="text-right">
          <p className="font-display text-lg font-bold leading-none">6 in</p>
          <p className="text-[0.7rem] text-muted-foreground">2 maybe</p>
        </div>
      </div>
    </motion.div>
  );
}

function FloatingTacoCard() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, rotate: -10 }}
      animate={{ opacity: 1, x: 0, rotate: -7 }}
      transition={{ duration: 0.7, delay: 0.35 }}
      className="absolute -left-4 top-2 z-20 hidden w-44 rounded-2xl border-2 border-border bg-accent p-3.5 sm:block lg:-left-10"
    >
      <p className="text-2xl">🌮</p>
      <p className="mt-1.5 font-display text-sm font-bold leading-tight">
        Taco crawl, Saturday
      </p>
      <p className="mt-1 text-[0.7rem] font-medium text-accent-foreground/70">
        7 in · 3 maybe
      </p>
    </motion.div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/dashboard" : "/auth";
  const primaryLabel = isAuthenticated ? "Open your board" : "Start a ping";

  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b-2 border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#board" className="transition-colors hover:text-foreground">
              The board
            </a>
            <a href="#why" className="transition-colors hover:text-foreground">
              Why Pingo
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              Questions
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {!isAuthenticated && (
              <Button
                asChild
                variant="ghost"
                className="hidden text-sm font-semibold sm:inline-flex"
              >
                <Link to="/auth">Sign in</Link>
              </Button>
            )}
            <Button asChild className="gap-1.5">
              <Link to={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="dot-grid relative overflow-hidden border-b-2 border-border">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em]"
              >
                <span className="size-2 rounded-full bg-primary" />
                For the group chat that never commits
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="mt-6 font-display text-[2.6rem] font-extrabold leading-[0.98] sm:text-6xl lg:text-[4.2rem]"
              >
                From “we should”
                <br />
                to <span className="bg-accent px-2">“we're going.”</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12 }}
                className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground"
              >
                Pingo is the tiny board where your people say yes. Post one
                plan, tap in with a thumb, and watch a vague group chat turn
                into a real night out.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.18 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <Button asChild size="lg" className="group gap-2">
                  <Link to={primaryHref}>
                    {isAuthenticated ? "Open your board" : "Start a ping — it's free"}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="gap-2">
                  <a href="#how">
                    See how it works
                    <span className="text-muted-foreground">↓</span>
                  </a>
                </Button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-primary" /> Free for your crew
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-primary" /> No password needed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-4 text-primary" /> No group-chat archaeology
                </span>
              </motion.div>
            </div>

            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div
                aria-hidden
                className="absolute -right-10 -top-10 size-40 rounded-full border-2 border-dashed border-border"
              />
              <div
                aria-hidden
                className="absolute -bottom-8 -right-6 size-24 rounded-full bg-primary/15"
              />
              <FloatingTacoCard />
              <PreviewCard />

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
                transition={{
                  opacity: { duration: 0.4, delay: 0.5 },
                  scale: { duration: 0.4, delay: 0.5 },
                  y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
                }}
                className="absolute -bottom-6 right-2 z-20 flex items-center gap-2 rounded-full border-2 border-border bg-primary px-4 py-2 text-sm font-bold text-primary-foreground sm:right-6"
              >
                <Sparkles className="size-4" />
                6 tapped in
              </motion.div>
            </div>
          </div>
        </section>

        {/* Marquee */}
        <div className="overflow-hidden border-b-2 border-border bg-primary py-3 text-primary-foreground">
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                aria-hidden={copy === 1}
                className="flex shrink-0 items-center"
              >
                {marqueeWords.map((word) => (
                  <span
                    key={`${copy}-${word}`}
                    className="flex items-center gap-5 pr-5 text-sm font-bold uppercase tracking-[0.2em] whitespace-nowrap"
                  >
                    {word}
                    <span className="text-base leading-none">✳</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section id="how" className="border-b-2 border-border py-20 sm:py-24">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                How Pingo works
              </p>
              <h2 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">
                Three steps. Zero group-chat gymnastics.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <motion.div
                  key={step.number}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="relative rounded-2xl border-2 border-border bg-card p-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-full border-2 border-foreground bg-accent font-display text-xl font-extrabold">
                      {step.number}
                    </span>
                    <step.icon className="size-6 text-muted-foreground" />
                  </div>
                  <h3 className="mt-6 font-display text-2xl font-bold">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.copy}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Sample board */}
        <section
          id="board"
          className="ball-stripe border-b-2 border-border py-20 sm:py-24"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <motion.div {...fadeUp} className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  The board
                </p>
                <h2 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">
                  What Tuesday looks like when people actually answer.
                </h2>
              </motion.div>
              <motion.p
                {...fadeUp}
                className="max-w-sm text-sm leading-6 text-muted-foreground"
              >
                A ping is one plan with one tally. No threads, no polls, no
                “bumping this” three days later. Just a yes you can count.
              </motion.p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {samplePings.map((ping, index) => (
                <motion.article
                  key={ping.title}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="flex flex-col rounded-2xl border-2 border-border bg-card p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex size-12 items-center justify-center rounded-full text-2xl ${ping.tint}`}
                    >
                      {ping.emoji}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                      {ping.when}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-bold leading-tight">
                    {ping.title}
                  </h3>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    {ping.place}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {ping.host}'s ping
                    </span>
                    <span className="flex items-center gap-3 text-xs font-bold">
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Check className="size-3.5" /> {ping.in} in
                      </span>
                      <span className="text-muted-foreground">
                        {ping.maybe} maybe
                      </span>
                    </span>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        {/* Why Pingo */}
        <section
          id="why"
          className="border-b-2 border-border py-20 sm:py-24"
        >
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Why Pingo
              </p>
              <h2 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">
                Less “let me know” and more “see you there.”
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.06 }}
                  className="flex gap-4 rounded-2xl border-2 border-border bg-card p-6"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <feature.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-bold leading-tight">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                      {feature.copy}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Field notes */}
        <section className="border-b-2 border-border bg-foreground py-20 text-background sm:py-24">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <motion.div {...fadeUp} className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Field notes
              </p>
              <h2 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">
                What changes when the plan is on the board.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {notes.map((note, index) => (
                <motion.figure
                  key={note.name}
                  {...fadeUp}
                  transition={{ duration: 0.5, delay: index * 0.08 }}
                  className="flex flex-col rounded-2xl border border-background/25 bg-background/5 p-6"
                >
                  <span className="font-display text-4xl leading-none text-primary">
                    “
                  </span>
                  <blockquote className="mt-2 flex-1 text-base leading-7 text-background/90">
                    {note.quote}
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-background/20 pt-4">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {note.initials}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">
                        {note.name}
                      </span>
                      <span className="block text-xs text-background/60">
                        {note.crew}
                      </span>
                    </span>
                  </figcaption>
                </motion.figure>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b-2 border-border py-20 sm:py-24">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <motion.div {...fadeUp}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Questions
              </p>
              <h2 className="mt-3 font-display text-4xl font-extrabold sm:text-5xl">
                The small print, in plain words.
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
                Still curious? Start a ping — the board is the best explanation.
              </p>
            </motion.div>

            <motion.div {...fadeUp}>
              <Accordion type="single" collapsible className="w-full">
                {questions.map((item) => (
                  <AccordionItem
                    key={item.q}
                    value={item.q}
                    className="border-b border-border"
                  >
                    <AccordionTrigger className="py-5 text-left font-display text-lg font-bold hover:no-underline">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="pb-5 text-sm leading-6 text-muted-foreground">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <motion.div
              {...fadeUp}
              className="dot-grid relative overflow-hidden rounded-[2rem] border-2 border-border bg-primary px-6 py-14 text-primary-foreground sm:px-12 sm:py-16"
            >
              <div
                aria-hidden
                className="absolute -right-10 -top-10 size-44 rounded-full border-2 border-primary-foreground/30"
              />
              <div
                aria-hidden
                className="absolute -bottom-16 right-24 hidden size-28 rounded-full border-2 border-dashed border-primary-foreground/40 sm:block"
              />
              <div className="relative max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/75">
                  Your move
                </p>
                <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] sm:text-6xl">
                  Your next good night starts with one ping.
                </h2>
                <p className="mt-4 max-w-xl text-base leading-7 text-primary-foreground/85">
                  Put a plan on the board, send the link, and find out who's
                  actually free. It takes about as long as typing “we should
                  hang out.”
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    className="bg-background text-foreground hover:bg-background/90"
                  >
                    <Link to={primaryHref}>
                      {isAuthenticated ? "Open your board" : "Start a ping"}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  {!isAuthenticated && (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                    >
                      <Link to="/auth">I already have a board</Link>
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Wordmark />
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              For people who actually want to hang out. Ping your crew, tap in,
              and show up.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              Questions
            </a>
            <Link
              to={primaryHref}
              className="transition-colors hover:text-foreground"
            >
              {isAuthenticated ? "Your board" : "Sign in"}
            </Link>
            <span className="text-xs font-normal">
              © {new Date().getFullYear()} Pingo
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
