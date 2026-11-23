import { PingoMark } from "@/components/Wordmark";
import { useBrandAsset } from "@/providers/BrandingProvider";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  kind = "icon",
  alt = "PINGO",
}: {
  className?: string;
  kind?: "icon" | "logo" | "splash";
  alt?: string;
}) {
  const src = useBrandAsset(kind);
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("object-contain", className)}
        draggable={false}
      />
    );
  }
  return <PingoMark className={className} />;
}
