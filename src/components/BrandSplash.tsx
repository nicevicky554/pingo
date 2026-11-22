import { PingoMark } from "@/components/Wordmark";

/**
 * Shown only while the session is being restored or a route chunk loads.
 * Never mounted on internal navigation after the session is ready.
 */
export function BrandSplash({ label = "Restoring your session" }: { label?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="splash-mark">
        <PingoMark className="size-16 shadow-sm" />
      </div>
      <p className="splash-word mt-5 text-[1.35rem] font-semibold tracking-[-0.04em]">
        PINGO
      </p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}…</p>
      <div className="mt-6 h-[2px] w-24 overflow-hidden rounded-full bg-border">
        <span className="splash-progress block h-full w-1/2 rounded-full bg-primary" />
      </div>
    </main>
  );
}
