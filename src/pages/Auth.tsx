import { SetupNotice } from "@/components/SetupNotice";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/use-auth";
import { COUNTRIES, findCountry, flagFor } from "@/lib/countries";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronsUpDown,
  Loader2,
  Lock,
  MessageSquareText,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

function resolveRedirect(returnTo: string | null) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return "/app/chats";
}

function AuthPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("returnTo"));

  const [countryIso, setCountryIso] = useState("NG");
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullPhone, setFullPhone] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [authMode, setAuthMode] = useState<"test" | "live" | null>(null);

  const country = useMemo(() => findCountry(countryIso), [countryIso]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .rpc("get_auth_mode")
      .then(({ data, error: modeError }) => {
        if (!modeError && (data === "test" || data === "live")) setAuthMode(data);
        else setAuthMode("test");
      });
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const digits = phone.replace(/\D/g, "");
  const canSend = digits.length >= 6 && authMode !== null;

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend || !authMode) return;
    setIsLoading(true);
    setError(null);
    const target = `+${country.dial}${digits.replace(/^0+/, "")}`;
    try {
      if (authMode === "test") {
        // Test mode is controlled by the platform setting. No SMS is requested.
        window.localStorage.setItem("pingo:test_phone", target);
        setFullPhone(target);
        setStep("code");
        setSecondsLeft(0);
        return;
      }
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: target,
      });
      if (authError) throw authError;
      setFullPhone(target);
      setStep("code");
      setSecondsLeft(45);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (otp.length !== 6) return;
    setIsLoading(true);
    setError(null);
    try {
      if (authMode === "test") {
        const { error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
        navigate(redirect, { replace: true });
        return;
      }
      const { error: authError } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: otp,
        type: "sms",
      });
      if (authError) throw authError;
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="PINGO home">
            <Wordmark />
          </Link>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" /> Back to home
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="hidden lg:block"
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Welcome to PINGO
          </p>
          <h1 className="mt-4 max-w-lg text-5xl leading-[1.03] font-extrabold">
            Your number is
            <span className="font-serif-display block text-primary italic">
              your account.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-muted-foreground">
            No password to invent, reuse or leak. Verify your phone once and
            every PINGO device signs into the same person.
          </p>

          <div className="mt-10 max-w-md space-y-3">
            {[
              { icon: MessageSquareText, text: "One account for chats and calls" },
              { icon: ShieldCheck, text: "Private photos stay private by default" },
              { icon: Lock, text: "Row Level Security on every table" },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-semibold">{text}</span>
                <Check className="ml-auto size-4 text-primary" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="mx-auto w-full max-w-md"
        >
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            {step === "phone" ? (
              <>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Phone className="size-5" />
                </span>
                <h2 className="mt-4 text-2xl font-extrabold">
                  Sign in with your phone
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {authMode === "test"
                    ? "Pick your country and enter a number. In test mode no SMS is sent."
                    : "Pick your country and enter your number. We'll text a six-digit code."}
                </p>

                {authMode === null && (
                  <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Checking the
                    sign-in mode…
                  </p>
                )}

                {authMode === "test" && (
                  <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-200">
                    <strong className="font-bold">Test mode is on.</strong> No
                    SMS is sent. Enter any six digits on the next step to sign
                    in. An administrator can switch to live SMS in the admin
                    console.
                  </div>
                )}

                <form onSubmit={sendCode} className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground">
                      Country
                    </label>
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={countryOpen}
                          className="h-11 w-full justify-between font-medium"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="text-base">{flagFor(country.iso)}</span>
                            <span className="truncate">{country.name}</span>
                            <span className="text-muted-foreground">
                              +{country.dial}
                            </span>
                          </span>
                          <ChevronsUpDown className="size-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search country or code…" />
                          <CommandList>
                            <CommandEmpty>No country found.</CommandEmpty>
                            <CommandGroup>
                              {COUNTRIES.map((item) => (
                                <CommandItem
                                  key={item.iso}
                                  value={`${item.name} ${item.iso} ${item.dial}`}
                                  onSelect={() => {
                                    setCountryIso(item.iso);
                                    setCountryOpen(false);
                                  }}
                                >
                                  <span className="mr-2">{flagFor(item.iso)}</span>
                                  <span className="flex-1 truncate">{item.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    +{item.dial}
                                  </span>
                                  {item.iso === countryIso && (
                                    <Check className="ml-2 size-4 text-primary" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
                    >
                      Phone number
                    </label>
                    <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
                      <span className="text-sm font-semibold text-muted-foreground">
                        +{country.dial}
                      </span>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        placeholder="801 234 5678"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={isLoading || !canSend || authMode === null}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />{" "}
                        {authMode === "test" ? "Preparing…" : "Sending code…"}
                      </>
                    ) : (
                      <>
                        {authMode === "test" ? "Continue" : "Send my code"}{" "}
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>

                <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
                  By continuing you agree to keep PINGO conversations respectful.
                  Messages are stored securely in your Supabase project.
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setError(null);
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" /> Change number
                </button>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" />
                </span>
                <h2 className="mt-4 text-2xl font-extrabold">Enter your code</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {authMode === "test" ? (
                    <>
                      Test mode is on for{" "}
                      <span className="font-semibold text-foreground">
                        {fullPhone}
                      </span>
                      . Enter any six digits — nothing is sent.
                    </>
                  ) : (
                    <>
                      We sent a six-digit code to{" "}
                      <span className="font-semibold text-foreground">
                        {fullPhone}
                      </span>
                      .
                    </>
                  )}
                </p>

                <form onSubmit={verifyCode} className="mt-6 space-y-4">
                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      autoFocus
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {error && (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="h-11 w-full"
                    disabled={isLoading || otp.length !== 6}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Checking…
                      </>
                    ) : (
                      <>
                        Verify and continue <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>

                  <div className="text-center text-sm text-muted-foreground">
                    {authMode === "test" ? (
                      <span className="text-xs">
                        Testing only. Real SMS switches on when an administrator
                        enables live mode.
                      </span>
                    ) : secondsLeft > 0 ? (
                      <span>Resend available in {secondsLeft}s</span>
                    ) : (
                      <button
                        type="button"
                        className="font-semibold text-primary hover:underline"
                        onClick={() => void sendCode()}
                        disabled={isLoading}
                      >
                        Send a new code
                      </button>
                    )}
                  </div>
                </form>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function friendlyAuthError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Try again.";
  if (/anonymous.*(disabled|not enabled|not allowed)|anonymous sign-?ins? are disabled/i.test(message)) {
    return "Test mode needs Anonymous sign-ins enabled in Supabase → Authentication → Providers. Enable it, then try again.";
  }
  if (/provider is not enabled|phone.*not enabled/i.test(message)) {
    return "Phone sign-in is not enabled in Supabase yet. Enable the Phone provider and connect an SMS provider, then try again.";
  }
  if (/invalid.*phone|phone.*invalid/i.test(message)) {
    return "That phone number doesn't look right. Check the country code and digits.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Too many attempts. Wait a minute before requesting another code.";
  }
  if (/invalid.*token|token.*expired|otp/i.test(message)) {
    return "That code didn't match or has expired. Request a new one.";
  }
  return message;
}

export default AuthPage;
