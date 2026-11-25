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
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

function resolveRedirect(returnTo: string | null) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  // Returning accounts go straight to their chats. First-time accounts are
  // shown the setup steps by AppGate at the same destination.
  return "/app/chats";
}

type SendResult = { channel: "whatsapp" | "sms" };
type PhoneMode = "otp" | "none";
type CredentialStep = "login" | "register";

export default function AuthPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirect(searchParams.get("returnTo"));

  const [mode, setMode] = useState<PhoneMode>("otp");
  const [modeLoaded, setModeLoaded] = useState(false);
  const [recoveryFlow, setRecoveryFlow] = useState(false);
  const [countryIso, setCountryIso] = useState("NG");
  const [countryOpen, setCountryOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [fullPhone, setFullPhone] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [credentialStep, setCredentialStep] = useState<CredentialStep>("login");
  const [credential, setCredential] = useState("");
  const [credentialConfirm, setCredentialConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const country = useMemo(() => findCountry(countryIso), [countryIso]);
  const digits = phone.replace(/\D/g, "");
  const canSend = digits.length >= 6;
  const target = `+${country.dial}${digits.replace(/^0+/, "")}`;

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  // The administrator chooses the mode; the server re-checks it for every
  // registration and sign-in request. A missing RPC keeps OTP as the safe
  // default rather than silently weakening authentication.
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!isSupabaseConfigured) {
        setModeLoaded(true);
        return;
      }
      const { data, error: rpcError } = await supabase.rpc(
        "get_phone_registration_mode",
      );
      if (!active) return;
      if (!rpcError && data === "none") setMode("none");
      setModeLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  async function requestCode(targetValue: string): Promise<SendResult> {
    let response: Response | null = null;
    try {
      response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: targetValue, recovery: recoveryFlow }),
      });
    } catch {
      response = null;
    }

    if (response) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        channel?: string;
        code?: string;
      } | null;
      if (response.ok && payload?.channel === "whatsapp") {
        return { channel: "whatsapp" };
      }
      if (payload?.code === "otp_disabled") {
        throw new Error(
          payload.error ??
            "SMS verification is turned off. Reload to sign in with your PIN.",
        );
      }
      if (response.status === 400 || response.status === 429) {
        throw new Error(payload?.error ?? "Could not send the code.");
      }
      // Delivery failed or the route is missing. PINGO never falls back to
      // Supabase's SMS phone provider: it is usually disabled, which surfaced
      // as "Unsupported phone provider". Report the real server error instead.
      throw new Error(
        payload?.error ??
          (response.status === 404
            ? "Code delivery is not available on this host. The PINGO server routes (/api/auth) are not deployed here."
            : "Could not send your code. Try again shortly."),
      );
    }

    throw new Error(
      "Could not reach the PINGO sign-in service. Check your connection and try again.",
    );
  }

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    setLoading(true);
    setError(null);
    try {
      const result = await requestCode(target);
      setChannel(result.channel);
      setDeliveryNote(
        result.channel === "whatsapp"
          ? "Open WhatsApp to get your code. It expires in five minutes."
          : "WhatsApp delivery is unavailable right now, so the code was sent by SMS instead.",
      );
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
      if (channel === "whatsapp") {
        const response = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: fullPhone, code: otp }),
        });
        const payload = (await response.json().catch(() => null)) as {
          token_hash?: string;
          error?: string;
        } | null;
        if (!response.ok || !payload?.token_hash) {
          throw new Error(
            payload?.error ?? "Could not verify that code. Request a new one.",
          );
        }
        // The server checked the code; exchange its single-use hash for the
        // real Supabase session on this device.
        const { error: authError } = await supabase.auth.verifyOtp({
          token_hash: payload.token_hash,
          type: "magiclink",
        });
        if (authError) throw authError;
      }
      navigate(redirect, { replace: true });
    } catch (err) {
      setAttempts((count) => count + 1);
      setError(friendlyAuthError(err));
      setOtp("");
    } finally {
      setLoading(false);
    }
  }

  async function credentialSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSend || loading) return;
    if (credentialStep === "register") {
      if (credential.trim().length < 6) {
        setError("Choose a PIN of 6–12 digits or a password of at least 8 characters.");
        return;
      }
      if (credential !== credentialConfirm) {
        setError("The two PIN entries do not match.");
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        credentialStep === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: target, credential }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        session?: { access_token: string; refresh_token: string };
        token_hash?: string;
        error?: string;
        code?: string;
      } | null;

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "Account sign-in needs the PINGO server routes (/api/auth). Use the verification-code flow on this host.",
          );
        }
        throw new Error(payload?.error ?? "Sign-in failed. Try again.");
      }

      if (payload?.session) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
        if (sessionError) throw sessionError;
      } else if (payload?.token_hash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: payload.token_hash,
          type: "magiclink",
        });
        if (verifyError) throw verifyError;
      } else {
        throw new Error("The server did not return a session.");
      }

      navigate(redirect, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
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

        {!modeLoaded ? (
          <div className="mt-12 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : mode === "none" ? (
          <form onSubmit={credentialSubmit} className="mt-9">
            <h1 className="text-[1.7rem] leading-tight font-semibold tracking-[-0.03em]">
              {credentialStep === "login" ? "Sign in to PINGO" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {credentialStep === "login"
                ? "Enter the number you registered and the PIN you chose. The same number always opens the same account."
                : "Register with your phone number and a PIN or password. No SMS is required on this deployment; keep the PIN safe because it protects your account."}
            </p>

            <div className="mt-7 flex rounded-lg bg-secondary p-1">
              {(
                [
                  ["login", "Sign in"],
                  ["register", "Create account"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCredentialStep(id);
                    setError(null);
                  }}
                  className={
                    credentialStep === id
                      ? "flex-1 rounded-md bg-card px-3 py-1.5 text-xs font-semibold shadow-sm"
                      : "flex-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            <CountryPicker
              countryIso={countryIso}
              countryOpen={countryOpen}
              setCountryIso={setCountryIso}
              setCountryOpen={setCountryOpen}
            />

            <div className="mt-5">
              <label htmlFor="phone" className="text-xs font-medium text-muted-foreground">
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
            </div>

            <div className="mt-4">
              <label htmlFor="credential" className="text-xs font-medium text-muted-foreground">
                {credentialStep === "login" ? "PIN or password" : "Choose a PIN or password"}
              </label>
              <div className="mt-1.5 flex items-end gap-2 border-b border-input pb-2 transition-colors focus-within:border-primary">
                <KeyRound className="mb-1 size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="credential"
                  type="password"
                  inputMode={/^\d*$/.test(credential) ? "numeric" : "text"}
                  autoComplete={
                    credentialStep === "login" ? "current-password" : "new-password"
                  }
                  placeholder={
                    credentialStep === "login"
                      ? "Your PIN or password"
                      : "6–12 digits, or 8+ characters"
                  }
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  disabled={loading}
                  className="h-8 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                />
              </div>
              {credentialStep === "register" && (
                <p className="mt-1.5 text-[0.65rem] leading-5 text-muted-foreground">
                  The PIN is stored by Supabase Auth as a one-way hash. PINGO never
                  keeps the plain PIN, and no universal code exists.
                </p>
              )}
            </div>

            {credentialStep === "register" && (
              <div className="mt-4">
                <label
                  htmlFor="credential-confirm"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Confirm PIN or password
                </label>
                <div className="mt-1.5 flex items-end gap-2 border-b border-input pb-2 transition-colors focus-within:border-primary">
                  <ShieldCheck className="mb-1 size-4 shrink-0 text-muted-foreground" />
                  <Input
                    id="credential-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat it"
                    value={credentialConfirm}
                    onChange={(event) => setCredentialConfirm(event.target.value)}
                    disabled={loading}
                    className="h-8 flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="mt-6 h-11 w-full font-semibold"
              disabled={!canSend || loading || (credentialStep === "register" && credential.length < 6)}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : credentialStep === "login" ? (
                <>
                  Sign in <ArrowRight className="size-4" />
                </>
              ) : (
                <>
                  Create account <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <p className="mt-5 flex items-start gap-2 rounded-lg bg-secondary/70 px-3 py-2.5 text-[0.65rem] leading-5 text-muted-foreground">
              <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
              Phone verification is currently disabled by the administrator. This
              deployment does not prove that you own the number; your PIN is the
              only protection for the account.
            </p>

            <button
              type="button"
              onClick={() => {
                setRecoveryFlow(true);
                setMode("otp");
                setError(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ShieldCheck className="size-3.5" /> Sign in with a verification code
              instead
            </button>

            <LegalNote />
          </form>
        ) : step === "phone" ? (
          <form onSubmit={sendCode} className="mt-10">
            <h1 className="text-[1.7rem] leading-tight font-semibold tracking-[-0.03em]">
              Welcome to PINGO
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {recoveryFlow
                ? "Recovery verifies the number on an existing account. No new account is created in no-SMS mode."
                : "Enter your phone number and we'll send a six-digit code to WhatsApp. The same number always opens the same account."}
            </p>

            <CountryPicker
              countryIso={countryIso}
              countryOpen={countryOpen}
              setCountryIso={setCountryIso}
              setCountryOpen={setCountryOpen}
            />

            <div className="mt-5">
              <label htmlFor="phone" className="text-xs font-medium text-muted-foreground">
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
                Include the number without the country code. WhatsApp needs to be
                active on this number.
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

            {recoveryFlow && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryFlow(false);
                  setMode("none");
                  setError(null);
                }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ArrowLeft className="size-3.5" /> Back to PIN sign-in
              </button>
            )}

            <LegalNote />
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
                setDeliveryNote(null);
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Change number
            </button>

            <h1 className="mt-6 text-[1.6rem] leading-tight font-semibold tracking-[-0.03em]">
              {channel === "whatsapp"
                ? "Enter your WhatsApp code"
                : "Enter verification code"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We sent a six-digit code to{" "}
              <span className="font-medium text-foreground">{fullPhone}</span>.
            </p>
            {deliveryNote && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {deliveryNote}
              </p>
            )}

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
                Too many attempts. Change the number or wait a minute before trying
                again.
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

function CountryPicker({
  countryIso,
  countryOpen,
  setCountryIso,
  setCountryOpen,
}: {
  countryIso: string;
  countryOpen: boolean;
  setCountryIso: (iso: string) => void;
  setCountryOpen: (open: boolean) => void;
}) {
  const country = findCountry(countryIso);
  return (
    <div className="mt-7">
      <label className="text-xs font-medium text-muted-foreground">Country</label>
      <Popover open={countryOpen} onOpenChange={setCountryOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={countryOpen}
            className="mt-1.5 flex w-full items-center gap-2 border-b border-input pb-2.5 text-left transition-colors hover:border-muted-foreground"
          >
            <span className="text-lg leading-none">{flagFor(country.iso)}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {country.name}
            </span>
            <span className="text-sm text-muted-foreground">+{country.dial}</span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </button>
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
                    <span className="text-xs text-muted-foreground">+{item.dial}</span>
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
  );
}

function LegalNote() {
  return (
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
    return "Too many attempts. Wait a minute before trying again.";
  }
  if (/whatsapp|twilio/i.test(message)) {
    return message;
  }
  if (/phone_otp_codes|0014|not ready/i.test(message)) {
    return message;
  }
  if (/invalid.*token|token.*expired|otp/i.test(message)) {
    return "That code didn't match or has expired. Request a new one.";
  }
  if (/already registered|phone_taken/i.test(message)) {
    return "This number is already registered. Use Sign in instead.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "The PINGO server could not be reached. Check your connection and try again.";
  }
  return message;
}
