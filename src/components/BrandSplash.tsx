import { BrandLogo } from "@/components/BrandLogo";
import { useBranding } from "@/providers/BrandingProvider";

/**
 * Startup / session restore. No marketing copy, no fake percentage and no
 * progress bar. The dots only indicate that real session loading is happening.
 */
export function BrandSplash() {
  const { assets } = useBranding();
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center bg-background bg-cover bg-center"
      style={
        assets.splash_background_url
          ? { backgroundImage: `url(${assets.splash_background_url})` }
          : undefined
      }
      aria-busy="true"
      aria-label="Starting PINGO"
    >
      <div className="splash-mark">
        <BrandLogo kind="splash" className="size-16 shadow-sm" />
      </div>
      <p className="splash-word mt-5 text-[1.3rem] font-semibold tracking-[-0.045em]">
        PINGO
      </p>
      <span className="mt-5 flex items-center gap-1.5 text-muted-foreground" aria-hidden="true">
        <span className="typing-dot size-1.5 rounded-full bg-current" />
        <span className="typing-dot size-1.5 rounded-full bg-current" />
        <span className="typing-dot size-1.5 rounded-full bg-current" />
      </span>
    </main>
  );
}
