import { cn } from "@/lib/utils";

export function PingoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="PINGO"
      className={cn("size-9", className)}
    >
      <rect width="40" height="40" rx="12" fill="var(--primary)" />
      <circle cx="20" cy="20" r="3.4" fill="var(--primary-foreground)" />
      <path
        d="M13.2 20a6.8 6.8 0 0 1 6.8-6.8"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M9 20a11 11 0 0 1 11-11"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
      <path
        d="M26.8 20a6.8 6.8 0 0 1-6.8 6.8"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d="M31 20a11 11 0 0 1-11 11"
        stroke="var(--primary-foreground)"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  showTagline = false,
}: {
  className?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <PingoMark className="size-8" />
      <span className="flex flex-col leading-none">
        <span className="text-[1.3rem] font-semibold tracking-[-0.045em]">
          PINGO
        </span>
        {showTagline && (
          <span className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            messages that land
          </span>
        )}
      </span>
    </span>
  );
}
