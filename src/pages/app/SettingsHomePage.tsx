import { UserAvatar } from "@/components/UserAvatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { PageHeader } from "@/components/app/PageHeader";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  ChevronRight,
  HardDrive,
  HelpCircle,
  Info,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Palette,
  ShieldCheck,
  Smartphone,
  UserRound,
  WalletCards,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

const GROUPS = [
  {
    label: "Account",
    items: [
      { to: "/app/settings/profile", label: "My profile", icon: UserRound },
      { to: "/app/settings/account", label: "Account", icon: WalletCards },
      { to: "/app/settings/privacy", label: "Privacy", icon: LockKeyhole },
      { to: "/app/settings/security", label: "Security", icon: ShieldCheck },
      {
        to: "/app/settings/devices",
        label: "Devices and sessions",
        icon: Smartphone,
      },
    ],
  },
  {
    label: "Chats",
    items: [
      { to: "/app/settings/chats", label: "Chats", icon: MessageSquare },
      { to: "/app/settings/notifications", label: "Notifications", icon: Bell },
      { to: "/app/settings/storage", label: "Storage and data", icon: HardDrive },
    ],
  },
  {
    label: "App",
    items: [
      { to: "/app/settings/appearance", label: "Appearance", icon: Palette },
      { to: "/app/settings/help", label: "Help and support", icon: HelpCircle },
      { to: "/app/settings/about", label: "About PINGO", icon: Info },
    ],
  },
];

export default function SettingsHomePage() {
  const { profile, session, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;

  const phone = session?.user.phone ?? profile.phone ?? null;

  return (
    <div className="page-enter min-h-0 flex-1 overflow-y-auto bg-background">
      <PageHeader title="Settings" back="/app/chats" />

      <div className="mx-auto w-full max-w-2xl pb-10">
        <Link
          to={`/app/profile/${profile.id}`}
          className="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-secondary/60"
        >
          <UserAvatar profile={profile} size="lg" showPresence />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[1rem] font-semibold">
                {profile.display_name || "Your name"}
              </span>
              <VerifiedBadge verified={profile.is_verified} />
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {profile.username ? `@${profile.username}` : "Choose a username"}
              {phone ? ` · ${phone}` : ""}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {profile.about?.trim() || "Tap to open your profile"}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>

        {GROUPS.map((group) => (
          <section key={group.label} className="mt-2">
            <h2 className="px-4 pt-3 pb-1.5 text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {group.label}
            </h2>
            <div className="border-y border-border bg-card">
              {group.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-secondary/60 ${
                      index < group.items.length - 1 ? "border-b border-border/70" : ""
                    }`}
                  >
                    <Icon
                      className="size-[19px] shrink-0 text-muted-foreground"
                      strokeWidth={1.8}
                    />
                    <span className="min-w-0 flex-1 text-[0.9rem]">
                      {item.label}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/70" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <section className="mt-2 border-y border-border bg-card">
          <button
            type="button"
            className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[0.9rem] text-destructive transition-colors hover:bg-destructive/5"
            onClick={() => {
              if (!window.confirm("Log out of PINGO on this device?")) return;
              void signOut().then(() => navigate("/", { replace: true }));
            }}
          >
            <LogOut className="size-[19px] shrink-0" strokeWidth={1.8} />
            Log out
          </button>
        </section>

        <p className="mt-6 px-6 text-center text-[0.65rem] leading-5 text-muted-foreground">
          PINGO · messaging over Supabase
        </p>
      </div>
    </div>
  );
}
