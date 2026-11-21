import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Wordmark } from "@/components/Wordmark";

import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Mail, UserRound } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "We couldn't send that code. Give it another try.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);
      setError("That code didn't match. Check the digits and try again.");
      setIsLoading(false);
      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      setError(
        error instanceof Error
          ? `We couldn't start a guest session: ${error.message}`
          : "We couldn't start a guest session. Please try again.",
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="dot-grid flex min-h-screen flex-col bg-background">
      <header className="border-b-2 border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Back to home
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden lg:block"
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Plans start here
          </p>
          <h1 className="mt-4 max-w-lg font-display text-5xl font-extrabold leading-[0.98]">
            Get your people
            <br />
            in one place.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-muted-foreground">
            One board for every “we should hang out.” Sign in, put a plan up,
            and let the yeses do the rest.
          </p>

          <div className="mt-10 max-w-md space-y-4">
            {[
              "One email code, zero passwords",
              "Tap in, maybe, or can't in one thumb",
              "A crew board that never scrolls away",
            ].map((line, index) => (
              <div
                key={line}
                className="flex items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold">{line}</span>
                <Check className="ml-auto size-4 text-primary" />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mx-auto w-full max-w-md lg:mx-0"
        >
          <Card className="gap-0 overflow-hidden border-2 border-border bg-card pb-0">
            {step === "signIn" ? (
              <>
                <CardHeader className="text-center">
                  <div className="flex justify-center">
                    <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15">
                      <Mail className="size-6 text-primary" />
                    </span>
                  </div>
                  <CardTitle className="font-display text-3xl font-extrabold">
                    Start a ping
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm leading-6">
                    Enter your email and we'll send a six-digit code. No
                    password to invent or forget.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleEmailSubmit}>
                  <CardContent>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    >
                      Email
                    </label>
                    <div className="relative flex items-center gap-2">
                      <div className="relative flex-1">
                        <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="email"
                          name="email"
                          placeholder="you@example.com"
                          type="email"
                          className="h-11 pl-9"
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        size="icon"
                        className="size-11 shrink-0"
                        disabled={isLoading}
                        aria-label="Send me a code"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {error && (
                      <p className="mt-2 text-sm font-medium text-destructive">
                        {error}
                      </p>
                    )}

                    <div className="mt-6">
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-[0.65rem] font-bold uppercase tracking-[0.18em]">
                          <span className="bg-card px-3 text-muted-foreground">
                            Or skip the inbox
                          </span>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="mt-5 w-full gap-2"
                        onClick={handleGuestLogin}
                        disabled={isLoading}
                      >
                        <UserRound className="size-4" />
                        Peek in as a guest
                      </Button>
                      <p className="mt-2 text-center text-xs text-muted-foreground">
                        You can add an email later when you're ready.
                      </p>
                    </div>
                  </CardContent>
                </form>
              </>
            ) : (
              <>
                <CardHeader className="text-center">
                  <div className="flex justify-center">
                    <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15">
                      <Mail className="size-6 text-primary" />
                    </span>
                  </div>
                  <CardTitle className="font-display text-3xl font-extrabold">
                    Check your inbox
                  </CardTitle>
                  <CardDescription className="mt-1">
                    We sent a six-digit code to{" "}
                    <span className="font-semibold text-foreground">
                      {step.email}
                    </span>
                    .
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleOtpSubmit}>
                  <CardContent className="pb-4">
                    <input type="hidden" name="email" value={step.email} />
                    <input type="hidden" name="code" value={otp} />

                    <div className="flex justify-center">
                      <InputOTP
                        value={otp}
                        onChange={setOtp}
                        maxLength={6}
                        disabled={isLoading}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            otp.length === 6 &&
                            !isLoading
                          ) {
                            const form = (e.target as HTMLElement).closest(
                              "form",
                            );
                            if (form) form.requestSubmit();
                          }
                        }}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }).map((_, index) => (
                            <InputOTPSlot key={index} index={index} />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    {error && (
                      <p className="mt-3 text-center text-sm font-medium text-destructive">
                        {error}
                      </p>
                    )}
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      Nothing arrived?{" "}
                      <Button
                        variant="link"
                        type="button"
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                          setStep("signIn");
                          setError(null);
                          setOtp("");
                        }}
                      >
                        Try another email
                      </Button>
                    </p>
                  </CardContent>
                  <CardFooter className="flex-col gap-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Checking the code…
                        </>
                      ) : (
                        <>
                          Let me in
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep("signIn")}
                      disabled={isLoading}
                      className="w-full"
                    >
                      Use a different email
                    </Button>
                  </CardFooter>
                </form>
              </>
            )}

            <div className="border-t border-border bg-muted px-6 py-4 text-center text-xs text-muted-foreground">
              Small plans, actually made. One ping at a time.
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
