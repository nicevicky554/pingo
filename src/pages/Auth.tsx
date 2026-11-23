import { BrandLogo } from "@/components/BrandLogo";
import { SetupNotice } from "@/components/SetupNotice";
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
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronsUpDown,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

function resolveRedirect(returnTo: string | null) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return "/";
}

export default function AuthPage() {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const country = useMemo(() => findCountry(countryIso), [countryIso]);
  const digits = phone.replace(/\D/g, "");
  const canSend = digits.length >= 6;

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    setLoading(true);
    setError(null);
    const target = `+${country.dial}${digits.replace(/^0+/, "")}`;
    try {
      // Supabase Auth creates the user on first verification and restores the
      // same auth.users row on every later sign-in. No anonymous fallback.
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: target,
        options: { shouldCreateUser: true },
      });
      if (authError) throw authError;
      setFullPhone(target);
      setStep("code");
      setSecondsLeft(45);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (otp.length !== 6 || attempts >= 5) return;
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.verifyOtp({
        phone: fullPhone,
        token: otp,
        type: "sms",
      });
      if (authError) throw authError;
      navigate(redirect, { replace: true });
    } catch (err) {
      setAttempts((count) => count + 1);
      setError(friendlyAuthError(err));
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-6 py-10">
        <div className="flex items-center gap-2.5">
          <BrandLogo kind="logo" className="size-9 rounded-lg" />
          <span className="text-[1.05rem] font-bold tracking-[0.08em] text-foreground">
            PINGO
          </span>
        </div>

        {step === "phone" ? (
          <form onSubmit={sendCode} className="mt-10">
            <h1 className="text-[1.7rem] leading-tight font-semibold tracking-[-0.03em]">
              Welcome to PINGO
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Enter your phone number to continue. We use it to identify your
              account across devices.
            </p>

            <div className="mt-9">
              <label className="text-xs font-medium text-muted-foreground">
                Country
              </label>
              <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    role="combobox"
                    aria-expanded={countryOpen}
                    className="mt-1.5 flex w-full items-center gap-2 border-b border-input pb-2.5 text-left transition-colors hover:border-muted-foreground"
                  >
                    <span className="text-lg leading-none">
                      {flagFor(country.iso)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {country.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      +{country.dial}
                    </span>
                    <ChevronsUpDown className="size-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
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

            <div className="mt-5">
              <label
                htmlFor="phone"
                className="text-xs font-medium text-muted-foreground"
              >
                Phone number
              </label>
              <div className="mt-1.5 flex items-end gap-2 border-b border-input pb-2 transition-colors focus-within:border-primary">
                <span className="pb-0.5 text-sm font-medium text-muted-foreground">
                  +{country.dial}
                </span>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="801 234 5678"
                  value={phone}
                  onChange={(event) =>
                    setPhone(event.target.value.replace(/[^\d\s-]/g, ""))
                  }
                  disabled={loading}
                  className="h-8 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              <p className="mt-2 text-[0.7rem] text-muted-foreground">
                Include the number without the country code.
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-7 h-11 w-full font-semibold"
              disabled={!canSend || loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Continue <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="mt-6 text-center text-[0.68rem] leading-5 text-muted-foreground">
              By continuing you agree to the{" "}
              <Link to="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Terms
              </Link>
              ,{" "}
              <Link to="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link to="/guidelines" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                Community Guidelines
              </Link>
              .
            </p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6">
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError(null);
                setAttempts(0);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Change number
            </button>

            <h1 className="mt-6 text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">
              Enter verification code
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We sent a six-digit code to{" "}
              <span className="font-medium text-foreground">{fullPhone}</span>.
            </p>

            <div className="mt-7">
              <InputOTP
                value={otp}
                onChange={setOtp}
                maxLength={6}
                disabled={loading || attempts >= 5}
                autoFocus
              >
                <InputOTPGroup className="w-full justify-between gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-full rounded-md border border-input bg-card text-base first:rounded-md last:rounded-md"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            {attempts >= 5 && (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                Too many attempts. Change the number or wait a minute before
                trying again.
              </p>
            )}

            <Button
              type="submit"
              className="mt-6 h-11 w-full font-semibold"
              disabled={otp.length !== 6 || loading || attempts >= 5}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="size-4" /> Verify
                </>
              )}
            </Button>

            <div className="mt-5 text-center text-xs text-muted-foreground">
              {secondsLeft > 0 ? (
                <span>Resend available in {secondsLeft}s</span>
              ) : (
                <button
                  type="button"
                  className="font-medium text-primary hover:underline"
                  onClick={() => void sendCode()}
                  disabled={loading}
                >
                  Resend code
                </button>
              )}
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

function friendlyAuthError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Try again.";
  if (/provider is not enabled|phone.*not enabled/i.test(message)) {
    return "Phone sign-in is not enabled in Supabase yet. Enable the Phone provider and an SMS provider.";
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
