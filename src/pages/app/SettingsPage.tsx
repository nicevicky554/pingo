import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import type { UserSettings, Visibility } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Camera,
  Check,
  ImageOff,
  Loader2,
  LogOut,
  ShieldAlert,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";

const VISIBILITY_LABELS: Record<Visibility, string> = {
  everyone: "Everyone",
  contacts: "My contacts",
  contacts_except: "My contacts except…",
  only: "Only share with…",
  nobody: "Nobody",
};

const DEFAULT_VISIBILITY_OPTIONS: Visibility[] = [
  "everyone",
  "contacts",
  "contacts_except",
  "nobody",
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

const WALLPAPERS = [
  { value: "dots", label: "Dot grid" },
  { value: "plain", label: "Plain" },
  { value: "grid", label: "Fine grid" },
] as const;

function VisibilityPicker({
  value,
  onChange,
  label,
  description,
  options = DEFAULT_VISIBILITY_OPTIONS,
}: {
  value: Visibility;
  onChange: (value: Visibility) => void;
  label: string;
  description: string;
  options?: Visibility[];
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              value === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/40",
            )}
          >
            {VISIBILITY_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { profile, settings, session, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const { section } = useParams();
  const SECTIONS = [
    "profile",
    "privacy",
    "appearance",
    "notifications",
    "security",
    "account",
    "about",
  ] as const;
  const activeSection = SECTIONS.includes(
    (section ?? "profile") as (typeof SECTIONS)[number],
  )
    ? (section ?? "profile")
    : "profile";
  const sectionTitle =
    activeSection === "about"
      ? "About PINGO"
      : activeSection.charAt(0).toUpperCase() + activeSection.slice(1);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [about, setAbout] = useState(profile?.about ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<UserSettings | null>(
    settings ?? null,
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const primaryInput = useRef<HTMLInputElement>(null);
  const fallbackInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSettings(settings ?? null);
  }, [settings]);

  if (!profile) return null;

  async function saveProfile() {
    setSavingProfile(true);
    setProfileError(null);
    const cleanUsername = username.toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(cleanUsername)) {
      setProfileError("Usernames use 3–24 lowercase letters, numbers or underscores.");
      setSavingProfile(false);
      return;
    }
    if (name.trim().length < 2) {
      setProfileError("Enter the name people should see.");
      setSavingProfile(false);
      return;
    }
    const { data: taken } = await supabase
      .from("public_profiles")
      .select("id")
      .eq("username", cleanUsername)
      .neq("id", profile!.id)
      .maybeSingle();
    if (taken) {
      setProfileError("That username is already taken.");
      setSavingProfile(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim(),
        username: cleanUsername,
        about: about.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile!.id);
    if (error) setProfileError(error.message);
    else {
      await refresh();
      toast.success("Profile updated");
    }
    setSavingProfile(false);
  }

  async function uploadPhoto(file: File, kind: "primary" | "fallback") {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be smaller than 5 MB.");
      return;
    }
    const extension = file.name.split(".").pop() ?? "jpg";
    const bucket = kind === "primary" ? "profile-photos" : "avatars";
    const path = `${profile!.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      toast.error(uploadError.message);
      return;
    }
    if (kind === "primary") {
      await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", profile!.id);
    } else {
      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      await supabase
        .from("profiles")
        .update({ public_avatar_url: publicUrl.publicUrl })
        .eq("id", profile!.id);
    }
    await refresh();
    toast.success(kind === "primary" ? "Profile photo updated" : "Fallback photo saved");
  }

  async function removePhoto(kind: "primary" | "fallback") {
    await supabase
      .from("profiles")
      .update(kind === "primary" ? { avatar_path: null } : { public_avatar_url: null })
      .eq("id", profile!.id);
    await refresh();
    toast.success(kind === "primary" ? "Profile photo removed" : "Fallback photo removed");
  }

  async function saveSettings(patch: Partial<UserSettings>) {
    if (!localSettings) return;
    const next = { ...localSettings, ...patch };
    setLocalSettings(next);
    setSavingSettings(true);
    const { error } = await supabase
      .from("user_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", profile!.id);
    setSavingSettings(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
  }

  async function saveRecoveryEmail() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recoveryEmail)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: recoveryEmail });
    setEmailBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Confirmation sent. Check that inbox to verify the address.");
      setRecoveryEmail("");
    }
  }

  async function requestDeletion() {
    await supabase.from("security_events").insert({
      user_id: profile!.id,
      event: "account.deletion_requested",
      metadata: { source: "settings" },
    });
    setDeleteOpen(false);
    toast.success("Deletion request recorded for the support team.");
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="glass sticky top-0 z-10 flex h-14 items-center gap-2 border-x-0 border-t-0 px-2 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label="Back to settings"
          onClick={() => navigate("/app/settings")}
        >
          <ArrowLeft className="size-[19px]" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-[1rem] font-semibold tracking-[-0.015em]">
            {sectionTitle}
          </h1>
          <p className="truncate text-[0.68rem] text-muted-foreground">
            {profile.display_name} · @{profile.username}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <Tabs
          value={activeSection}
          onValueChange={(value) => navigate(`/app/settings/${value}`)}
        >
          <TabsList className="hidden">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          {/* Profile */}
          <TabsContent value="profile" className="mt-6 space-y-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">Your photos</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Your primary photo is stored privately. The fallback photo is
                shown to people who aren't allowed to see the primary one.
              </p>

              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar profile={profile} size="lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Primary photo</p>
                      <p className="text-xs text-muted-foreground">
                        Private bucket, signed access
                      </p>
                    </div>
                  </div>
                  <input
                    ref={primaryInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadPhoto(file, "primary");
                    }}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => primaryInput.current?.click()}
                    >
                      <Camera className="size-4" /> Change
                    </Button>
                    {profile.avatar_path && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive"
                        onClick={() => void removePhoto("primary")}
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    {profile.public_avatar_url ? (
                      <img
                        src={profile.public_avatar_url}
                        alt="Public fallback"
                        className="size-14 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <ImageOff className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Public fallback</p>
                      <p className="text-xs text-muted-foreground">
                        Visible when the primary is hidden
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fallbackInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadPhoto(file, "fallback");
                    }}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => fallbackInput.current?.click()}
                    >
                      <Camera className="size-4" /> Upload
                    </Button>
                    {profile.public_avatar_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive"
                        onClick={() => void removePhoto("fallback")}
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">Profile details</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="display-name">Display name</Label>
                  <Input
                    id="display-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={60}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <div className="mt-1.5 flex items-center rounded-lg border border-input px-3">
                    <span className="text-sm text-muted-foreground">@</span>
                    <Input
                      id="username"
                      value={username}
                      onChange={(event) =>
                        setUsername(
                          event.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, "_"),
                        )
                      }
                      maxLength={24}
                      className="border-0 shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="about">About</Label>
                  <Textarea
                    id="about"
                    value={about}
                    onChange={(event) => setAbout(event.target.value)}
                    placeholder="A short line about you"
                    maxLength={160}
                    rows={2}
                    className="mt-1.5"
                  />
                </div>
                {profileError && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {profileError}
                  </p>
                )}
                <Button onClick={() => void saveProfile()} disabled={savingProfile}>
                  {savingProfile ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Save profile
                </Button>
              </div>
            </section>
          </TabsContent>

          {/* Privacy */}
          <TabsContent value="privacy" className="mt-6 space-y-4">
            {localSettings && (
              <>
                <VisibilityPicker
                  label="Online status"
                  description="Who can see the live green dot while you're using PINGO."
                  value={localSettings.online_visibility}
                  onChange={(value) =>
                    void saveSettings({ online_visibility: value })
                  }
                />
                <VisibilityPicker
                  label="Last seen"
                  description="When you were last active. Choosing Nobody also hides yours from others."
                  value={localSettings.last_seen_visibility}
                  onChange={(value) =>
                    void saveSettings({ last_seen_visibility: value })
                  }
                />
                <VisibilityPicker
                  label="Profile photo"
                  description="Who can see your primary photo instead of the fallback."
                  value={localSettings.avatar_visibility}
                  onChange={(value) => void saveSettings({ avatar_visibility: value })}
                />
                <VisibilityPicker
                  label="Status updates"
                  description="Who can watch your 24-hour updates. Manage the exact people from the status editor."
                  value={localSettings.status_visibility}
                  options={["contacts", "contacts_except", "only", "everyone", "nobody"]}
                  onChange={(value) => void saveSettings({ status_visibility: value })}
                />
                <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-bold">Read receipts</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Show others when you've read their messages.
                    </p>
                  </div>
                  <Switch
                    checked={localSettings.read_receipts}
                    onCheckedChange={(checked) =>
                      void saveSettings({ read_receipts: checked })
                    }
                  />
                </div>
                {savingSettings && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Saving…
                  </p>
                )}
                <p className="text-xs leading-5 text-muted-foreground">
                  Visibility is checked in Postgres when the profile row is read
                  and in storage policies when a photo is requested.
                </p>
              </>
            )}
          </TabsContent>

          {/* Appearance */}
          <TabsContent value="appearance" className="mt-6 space-y-4">
            {localSettings && (
              <>
                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Theme</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {THEMES.map((theme) => (
                      <button
                        key={theme.value}
                        type="button"
                        onClick={() => void saveSettings({ theme: theme.value })}
                        className={cn(
                          "rounded-lg border px-3 py-6 text-xs font-semibold transition-colors",
                          localSettings.theme === theme.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40",
                        )}
                      >
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Message font size</p>
                  <div className="mt-3 flex gap-2">
                    {[
                      { value: "sm", label: "Small" },
                      { value: "md", label: "Default" },
                      { value: "lg", label: "Large" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          void saveSettings({
                            font_size: option.value as UserSettings["font_size"],
                          })
                        }
                        className={cn(
                          "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold",
                          localSettings.font_size === option.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-bold">Chat wallpaper</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {WALLPAPERS.map((wallpaper) => (
                      <button
                        key={wallpaper.value}
                        type="button"
                        onClick={() =>
                          void saveSettings({ wallpaper: wallpaper.value })
                        }
                        className={cn(
                          "rounded-lg border px-3 py-4 text-xs font-semibold",
                          localSettings.wallpaper === wallpaper.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border",
                        )}
                      >
                        {wallpaper.label}
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </TabsContent>

          {/* Notifications */}
          <TabsContent value="notifications" className="mt-6 space-y-4">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">Notification preferences</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                These control in-app and browser notifications. Muted
                conversations always stay quiet.
              </p>
              <div className="mt-4 divide-y divide-border">
                {(
                  [
                    ["messages", "Direct messages"],
                    ["groups", "Group messages"],
                    ["calls", "Calls"],
                    ["sound", "Sounds"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={localSettings?.notifications?.[key] !== false}
                      onCheckedChange={(checked) =>
                        void saveSettings({
                          notifications: {
                            ...(localSettings?.notifications ?? {}),
                            [key]: checked,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
          </TabsContent>

          {/* Security */}
          <TabsContent value="security" className="mt-6 space-y-4">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Smartphone className="size-4 text-primary" /> Active session
              </h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Signed in as</dt>
                  <dd className="font-medium">
                    {profile.username ? `@${profile.username}` : profile.display_name}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{session?.user.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Session started</dt>
                  <dd className="font-medium">
                    {session?.user.last_sign_in_at
                      ? new Date(session.user.last_sign_in_at).toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Sessions are issued and refreshed by Supabase Auth. Signing out
                everywhere revokes refresh tokens on all devices.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    await supabase.auth.signOut({ scope: "global" });
                    navigate("/");
                  }}
                >
                  <LogOut className="size-4" /> Sign out everywhere
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void signOut().then(() => navigate("/"))}
                >
                  Sign out here
                </Button>
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">Read receipts</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Turning this off stops sending read receipts and hides read
                ticks. Delivered ticks still reflect server delivery.
              </p>
              <label className="mt-4 flex items-center justify-between gap-4">
                <span className="text-sm">Send read receipts</span>
                <Switch
                  checked={localSettings?.read_receipts !== false}
                  onCheckedChange={(checked) =>
                    void saveSettings({ read_receipts: checked })
                  }
                />
              </label>
            </section>
          </TabsContent>

          {/* Account */}
          <TabsContent value="account" className="mt-6 space-y-4">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">Account</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium">{session?.user.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account ID</dt>
                  <dd className="truncate font-mono text-xs">{profile.id}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Recovery email</dt>
                  <dd className="font-medium">{session?.user.email ?? "Not set"}</dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-border pt-4">
                <Label htmlFor="recovery">Recovery email</Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Adding one keeps your account recoverable if you lose access to
                  your phone. Supabase sends a verification link.
                </p>
                <div className="mt-2 flex gap-2">
                  <Input
                    id="recovery"
                    type="email"
                    value={recoveryEmail}
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                  <Button onClick={() => void saveRecoveryEmail()} disabled={emailBusy}>
                    {emailBusy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Smartphone className="size-4 text-primary" /> Session
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Signed in{profile.username ? ` as @${profile.username}` : ""}.
                Sessions are issued by Supabase Auth and refreshed automatically.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={async () => {
                    await supabase.auth.signOut({ scope: "global" });
                    navigate("/");
                  }}
                >
                  <LogOut className="size-4" /> Sign out everywhere
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void signOut().then(() => navigate("/"))}
                >
                  Sign out here
                </Button>
              </div>
            </section>

            <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold text-destructive">
                <ShieldAlert className="size-4" /> Delete account
              </h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Deletion removes your messages and media. It requires a recorded
                support request so an administrator can verify ownership. This
                cannot be undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-3"
                onClick={() => setDeleteOpen(true)}
              >
                Request account deletion
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="about" className="mt-2 space-y-4">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-bold">PINGO</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                PINGO is a Supabase-backed messaging application. Messages,
                media, calls, channels, groups and statuses are stored in your
                own Supabase project.
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Account ID</dt>
                  <dd className="truncate font-mono text-xs">{profile.id}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="font-medium tabular-nums">
                    {session?.user.phone ?? profile.phone ?? "Not verified"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Backend</dt>
                  <dd className="font-medium">Supabase</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                <a href="/terms" className="font-medium text-primary hover:underline">
                  Terms
                </a>
                <a href="/privacy" className="font-medium text-primary hover:underline">
                  Privacy
                </a>
                <a href="/guidelines" className="font-medium text-primary hover:underline">
                  Guidelines
                </a>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request account deletion?</DialogTitle>
            <DialogDescription>
              Your request is logged for the support team. You will be contacted
              before anything is permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button variant="destructive" onClick={() => void requestDeletion()}>
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
