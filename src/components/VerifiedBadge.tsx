import { useBranding } from "@/providers/BrandingProvider";
import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({
  verified,
  className = "size-4",
  label = "Verified",
}: {
  verified?: boolean | null;
  className?: string;
  label?: string;
}) {
  const { assets } = useBranding();
  if (!verified) return null;
  if (assets.verified_badge_url) {
    return (
      <img
        src={assets.verified_badge_url}
        alt={label}
        title={label}
        className={`${className} shrink-0 object-contain`}
      />
    );
  }
  return (
    <BadgeCheck
      className={`${className} shrink-0 text-primary`}
      aria-label={label}
    />
  );
}
