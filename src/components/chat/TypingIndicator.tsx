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

export function TypingIndicator({
  names,
  activity,
  className,
}: {
  names: string[];
  activity?: string | null;
  className?: string;
}) {
  if (names.length === 0 && !activity) return null;

  let label: string;
  if (activity) label = activity;
  else if (names.length === 1) label = `${names[0]} is typing`;
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing`;
  else label = "Several people are typing";

  return (
    <div className={cn("flex items-center", className)}>
      <div
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card/85 px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground backdrop-blur-sm"
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
