import logo from "@/assets/logo.svg";
import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function Wordmark({
  to = "/",
  className,
  showMark = true,
}: {
  to?: string;
  className?: string;
  showMark?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      aria-label="Pingo home"
    >
      {showMark && (
        <img
          src={logo}
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-[0.6rem]"
        />
      )}
      <span className="font-display text-[1.65rem] leading-none font-extrabold tracking-tight">
        pingo<span className="text-primary">.</span>
      </span>
    </Link>
  );
}
