import { avatarColour, initialsFor, resolvePrivatePhoto } from "@/lib/avatar";
import { usePresence } from "@/providers/PresenceProvider";
import { cn } from "@/lib/utils";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";

export type AvatarProfile = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_path?: string | null;
  public_avatar_url?: string | null;
  online_visibility?: string;
};

const SIZES = {
  xs: "size-7 text-[0.6rem]",
  sm: "size-9 text-[0.7rem]",
  md: "size-11 text-[0.8rem]",
  lg: "size-14 text-[1rem]",
  xl: "size-24 text-[1.6rem]",
} as const;

const DOT_SIZES = {
  xs: "size-2 border",
  sm: "size-2.5 border-2",
  md: "size-3 border-2",
  lg: "size-3.5 border-2",
  xl: "size-5 border-[3px]",
} as const;

/**
 * Avatar loading order: cached/signed photo → public fallback photo →
 * deterministic initials. A broken URL never leaves an empty circle.
 */
export function UserAvatar({
  profile,
  size = "md",
  showPresence = false,
  className,
  ring,
}: {
  profile: AvatarProfile | null | undefined;
  size?: keyof typeof SIZES;
  showPresence?: boolean;
  className?: string;
  ring?: "unseen" | "viewed" | "own" | null;
}) {
  const { online } = usePresence();
  const [photo, setPhoto] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setPhoto(null);
    if (!profile?.avatar_path) return;

    resolvePrivatePhoto("profile-photos", profile.avatar_path).then((url) => {
      if (active) setPhoto(url);
    });
    return () => {
      active = false;
    };
  }, [profile?.avatar_path, profile?.id]);

  const colour = avatarColour(profile?.id ?? "pingo");
  const initials = initialsFor(profile?.display_name, profile?.username);
  const src = photo ?? profile?.public_avatar_url ?? null;
  const isOnline =
    showPresence &&
    Boolean(profile?.id) &&
    online.has(profile!.id) &&
    profile?.online_visibility === "everyone";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0",
        ring &&
          "rounded-full p-[2px] " +
            (ring === "unseen"
              ? "bg-[var(--accent)]"
              : ring === "own"
                ? "bg-primary"
                : "bg-muted-foreground/35"),
        className,
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full font-bold uppercase select-none",
          SIZES[size],
          ring && "border-2 border-background",
        )}
        style={{ backgroundColor: colour.bg, color: colour.fg }}
      >
        {src && !failed ? (
          <img
            src={src}
            alt={profile?.display_name || profile?.username || "Profile photo"}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : initials ? (
          <span aria-hidden="true">{initials}</span>
        ) : (
          <UserRound className="size-[55%]" aria-hidden="true" />
        )}
      </span>
      {showPresence && (
        <span
          aria-label={isOnline ? "Online" : "Offline"}
          title={isOnline ? "Online" : "Offline"}
          className={cn(
            "absolute right-0 bottom-0 rounded-full border-background",
            DOT_SIZES[size],
            isOnline ? "bg-emerald-500" : "hidden",
          )}
        />
      )}
    </span>
  );
}
