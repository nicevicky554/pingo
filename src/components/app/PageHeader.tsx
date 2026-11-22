import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: string;
  back?: string | (() => void);
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="glass sticky top-0 z-20 flex min-h-14 items-center gap-2 border-x-0 border-t-0 px-2 sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={() => {
          if (typeof back === "function") back();
          else if (typeof back === "string") navigate(back);
          else navigate(-1);
        }}
      >
        <ArrowLeft className="size-[19px]" />
      </Button>
      <div className="min-w-0 flex-1 py-2">
        <h1 className="truncate text-[1rem] font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[0.68rem] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}
