import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  CheckCheck,
  CircleDot,
  Globe2,
  Lock,
  MessageCircle,
  Mic,
  Phone,
  Radio,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Video,
} from "lucide-react";
import { Link } from "react-router";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5 },
};

function ChatPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" />
      <div className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_24px_60px_-30px_rgba(18,107,120,0.45)]">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-full bg-[#126B78] text-xs font-bold text-white">
            AM
            <span className="absolute right-0 bottom-0 size-3 rounded-full border-2 border-card bg-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Amara Mensah</p>
            <p className="text-[0.7rem] font-medium text-primary">typing…</p>
          </div>
          <span className="flex size-8 items-center justify-center rounded-full text-muted-foreground">
            <Phone className="size-4" />
          </span>
          <span className="flex size-8 items-center justify-center rounded-full text-muted-foreground">
            <Video className="size-4" />
          </span>
        </div>

        <div className="chat-wallpaper space-y-2.5 px-3.5 py-5">
          <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[0.8rem] leading-5 text-primary-foreground">
            Landed in Accra. The studio is two streets from the water 🌊
            <span className="mt-1 flex items-center justify-end gap-1 text-[0.6rem] opacity-80">
              14:02 <CheckCheck className="size-3" />
            </span>
          </div>
          <div className="w-fit max-w-[82%] rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 text-[0.8rem] leading-5">
            Then we're doing sunset there. Bringing the camera.
            <span className="mt-1 block text-right text-[0.6rem] text-muted-foreground">
              14:03
            </span>
          </div>
          <div className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[0.8rem] leading-5 text-primary-foreground">
            <span className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold opacity-85">
              <Mic className="size-3" /> Voice note · 0:14
            </span>
            <span className="flex h-6 items-end gap-[3px]">
              {[6, 12, 9, 18, 14, 22, 10, 16, 8, 20, 12, 17, 7, 14, 11, 19, 8, 13].map(
                (h, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-primary-foreground/70"
                    style={{ height: h }}
                  />
                ),
              )}
            </span>
          </div>
          <div className="w-fit rounded-full border border-border bg-card/90 px-3 py-2 backdrop-blur">
            <span className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="typing-dot size-1.5 rounded-full bg-primary"
                />
              ))}
              <span className="ml-1.5 text-[0.65rem] font-medium text-muted-foreground">
                Amara is typing
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-3 py-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Sparkles className="size-4" />
          </span>
          <div className="flex-1 rounded-full border border-border bg-muted/60 px-3 py-2 text-[0.75rem] text-muted-foreground">
            Write a message…
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Chats that keep pace",
    body: "Realtime messages, replies, reactions and receipts. Everything lands the moment it is sent, ordered and searchable.",
  },
  {
    icon: Radio,
    title: "Updates worth watching",
    body: "Photo, video and text statuses with a 24-hour lifetime, audience controls and a viewer list you can actually read.",
  },
  {
    icon: UsersRound,
    title: "Groups and communities",
    body: "From a five-person group to a community of many groups, with admin roles and clear member permissions.",
  },
  {
    icon: Phone,
    title: "Calls built on WebRTC",
    body: "The call layer is designed around WebRTC, TURN and an SFU for group calls — with honest quality indicators.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy on the server",
    body: "Profile-photo visibility is enforced in Postgres, not hidden with CSS. Block, restrict and control discovery.",
  },
  {
    icon: Globe2,
    title: "Every device, one account",
    body: "A responsive web client today, with a documented path to Expo for Android and iOS on the same backend.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Claim your number",
    body: "Pick your country, enter your phone number and confirm the six-digit code. No password to memorise.",
  },
  {
    n: "02",
    title: "Set up your identity",
    body: "Choose a unique @username and a photo. If you skip the photo, a deterministic initials avatar takes over.",
  },
  {
    n: "03",
    title: "Start the conversation",
    body: "Find people by username or start a group. Messages, typing and presence are live from the first hello.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const appHref = isAuthenticated ? "/app/chats" : "/auth?returnTo=%2Fapp%2Fchats";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="PINGO home">
            <Wordmark />
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#privacy" className="transition-colors hover:text-foreground">
              Privacy
            </a>
            <Link to="/admin" className="transition-colors hover:text-foreground">
              Admin
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to={appHref}>{isAuthenticated ? "Open PINGO" : "Sign in"}</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full px-4">
              <Link to={appHref}>
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="teal-glow relative overflow-hidden border-b border-border">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
            <div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/70 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary"
              >
                <CircleDot className="size-3.5" />
                Global messaging, rebuilt calmly
              </motion.p>

              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="mt-5 max-w-xl text-[2.7rem] leading-[1.02] font-extrabold sm:text-6xl"
              >
                Messages that
                <span className="font-serif-display block text-primary italic">
                  actually land.
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.12 }}
                className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg"
              >
                PINGO brings private chats, groups, communities, channels and
                calls into one fast, quiet place. No noise, no lost messages, no
                guessing whether it arrived.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.18 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <Button asChild size="lg" className="rounded-full px-6">
                  <Link to={appHref}>
                    Start messaging <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary/25 bg-card/60 px-6"
                >
                  <a href="#features">See what's inside</a>
                </Button>
              </motion.div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-3.5 text-primary" /> TLS on every request
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BellRing className="size-3.5 text-primary" /> Real-time by default
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCheck className="size-3.5 text-primary" /> Delivery receipts
                </span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <ChatPreview />
            </motion.div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-b border-border bg-card">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-border sm:grid-cols-4">
            {[
              ["Realtime", "Postgres + Realtime"],
              ["Server-side", "Row Level Security"],
              ["Global", "Phone-number identity"],
              ["Open roadmap", "Web → mobile"],
            ].map(([title, sub]) => (
              <div key={title} className="px-4 py-5 text-center">
                <p className="text-sm font-extrabold">{title}</p>
                <p className="mt-0.5 text-[0.7rem] font-medium text-muted-foreground">
                  {sub}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <motion.div {...fadeUp} className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              The product
            </p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              Familiar where it should be. Better where it counts.
            </h2>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              The interaction patterns you already know, rebuilt on a
              Supabase-backed platform with permissions that live in the
              database.
            </p>
          </motion.div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  {...fadeUp}
                  transition={{ duration: 0.45, delay: index * 0.04 }}
                  className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/35"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {feature.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-y border-border bg-card">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr]">
              <motion.div {...fadeUp}>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                  Getting in
                </p>
                <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                  Three steps.
                  <br />
                  No passwords.
                </h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">
                  Phone numbers keep PINGO identities real and searchable.
                  Verify once, add a recovery email later, and every device signs
                  into the same account.
                </p>
                <Button asChild className="mt-6 rounded-full">
                  <Link to={appHref}>
                    Create your account <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </motion.div>

              <div className="space-y-3">
                {STEPS.map((step, index) => (
                  <motion.div
                    key={step.n}
                    {...fadeUp}
                    transition={{ duration: 0.45, delay: index * 0.05 }}
                    className="flex gap-4 rounded-2xl border border-border bg-background p-5"
                  >
                    <span className="font-serif-display text-3xl leading-none text-primary">
                      {step.n}
                    </span>
                    <div>
                      <h3 className="text-base font-bold">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div {...fadeUp}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
                Privacy, engineered
              </p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                Your photo isn't public just because your account is.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Choose Everyone, My Contacts or Nobody for your profile photo.
                Add a separate public fallback photo for people who can't see the
                main one. The rule is applied when the row is read, not with a CSS
                class that a client can remove.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Row Level Security on every exposed table",
                  "Private storage buckets with signed access",
                  "Blocking removes presence and profile visibility",
                  "No end-to-end encryption claim until it is shipped",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div {...fadeUp} className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">Profile photo visibility</p>
                <Lock className="size-4 text-primary" />
              </div>
              <div className="mt-4 space-y-2">
                {[
                  ["Everyone", "Anyone on PINGO", true],
                  ["My contacts", "People you've saved", false],
                  ["Nobody", "Fallback photo only", false],
                ].map(([label, sub, active]) => (
                  <div
                    key={String(label)}
                    className={
                      active
                        ? "flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
                        : "flex items-center justify-between rounded-xl border border-border px-4 py-3"
                    }
                  >
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground">{sub}</p>
                    </div>
                    <span
                      className={
                        active
                          ? "size-4 rounded-full border-[5px] border-primary"
                          : "size-4 rounded-full border border-input"
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-[0.7rem] leading-5 text-muted-foreground">
                Enforced by a Postgres view and storage policies. The private
                photo path is only returned to allowed viewers.
              </p>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-primary text-primary-foreground">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 lg:py-20">
            <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">
              Open PINGO and send the first one.
            </h2>
            <p className="max-w-xl text-sm leading-7 text-primary-foreground/80">
              Free to start, built for real conversations. Bring your people and
              we'll handle the delivery.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary" className="rounded-full px-6">
                <Link to={appHref}>
                  Start messaging <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="rounded-full border border-primary-foreground/25 px-6 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/admin">Administration console</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} PINGO
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#privacy" className="hover:text-foreground">Privacy</a>
            <Link to="/app/settings" className="hover:text-foreground">Settings</Link>
            <Link to="/admin" className="hover:text-foreground">Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
