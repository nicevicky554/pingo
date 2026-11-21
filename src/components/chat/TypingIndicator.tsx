import { cn } from "@/lib/utils";

export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-hidden="true"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="typing-dot size-1.5 rounded-full bg-current"
        />
      ))}
    </span>
  );
}

/**
 * Summarises one or many people typing without listing an unlimited number of
 * names. The capsule uses a light glass treatment; it is the only place the
 * interface intentionally uses blur.
 */
export function TypingIndicator({
  names,
  className,
}: {
  names: string[];
  className?: string;
}) {
  if (names.length === 0) return null;

  let label: string;
  if (names.length === 1) label = `${names[0]} is typing`;
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing`;
  else label = "Several people are typing";

  return (
    <div className={cn("flex items-center", className)}>
      <div
        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-[0.7rem] font-medium text-muted-foreground backdrop-blur"
        role="status"
        aria-live="polite"
      >
        <span className="text-primary">
          <TypingDots />
        </span>
        {label}
      </div>
    </div>
  );
}
