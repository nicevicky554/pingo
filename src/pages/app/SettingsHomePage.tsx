import { UserAvatar } from "@/components/UserAvatar";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  ChevronRight,
  Info,
  LockKeyhole,
  Palette,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router";

const SECTIONS = [
  {
    to: "/app/settings/profile",
    label: "Profile",
    description: "Name, username, about and profile photos",
    icon: UserRound,
  },
  {
    to: "/app/settings/account",
    label: "Account",
    description: "Phone number, recovery email and deletion",
    icon: WalletCards,
  },
  {
    to: "/app/settings/privacy",
    label: "Privacy",
    description: "Last seen, profile photo, read receipts and blocked users",
    icon: LockKeyhole,
  },
  {
    to: "/app/settings/security",
    label: "Security and devices",
    description: "Active session, read receipts and sign-out controls",
    icon: ShieldCheck,
  },
  {
    to: "/app/settings/notifications",
    label: "Notifications",
    description: "Messages, groups, calls and sounds",
    icon: Bell,
  },
  {
    to: "/app/settings/appearance",
    label: "Appearance",
    description: "Theme, wallpaper and message text size",
    icon: Palette,
  },
  {
    to: "/app/settings/about",
    label: "About PINGO",
    description: "Version, policies and support",
    icon: Info,
  },
];

export default function SettingsHomePage() {
  const { profile, session } = useAuth();
  if (!profile) return null;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Settings" back="/app/chats" />
      <div className="mx-auto w-full max-w-2xl px-4 py-4">
        <Link
          to={`/app/profile/${profile.id}`}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-secondary/50"
        >
          <UserAvatar profile={profile} size="lg" showPresence />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.95rem] font-semibold">
              {profile.display_name}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              @{profile.username}
            </span>
            <span className="mt-0.5 block truncate text-xs tabular-nums text-muted-foreground">
              {session?.user.phone ?? profile.phone ?? "No verified phone"}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {SECTIONS.map((section, index) => {
            const Icon = section.icon;
            return (
              <Link
                key={section.to}
                to={section.to}
                className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-secondary/50 ${
                  index < SECTIONS.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{section.label}</span>
                  <span className="mt-0.5 block text-[0.7rem] leading-5 text-muted-foreground">
                    {section.description}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[0.68rem] leading-5 text-muted-foreground">
          PINGO web · Supabase backend
        </p>
      </div>
    </div>
  );
}
