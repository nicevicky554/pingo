import { UserAvatar } from "@/components/UserAvatar";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Camera, Check, Loader2, LogOut } from "lucide-react";
import { useRef, useState } from "react";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 24);
}

export default function Onboarding() {
  const { profile, refresh, signOut } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameState, setUsernameState] = useState<
    "idle" | "checking" | "free" | "taken" | "invalid"
  >("idle");

  const usernameValid = /^[a-z0-9_]{3,24}$/.test(username);

  async function checkUsername() {
    if (!usernameValid) {
      setUsernameState("invalid");
      return;
    }
    setUsernameState("checking");
    const { data, error: queryError } = await supabase
      .from("public_profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (queryError) {
      setUsernameState("idle");
      return;
    }
    setUsernameState(data ? "taken" : "free");
  }

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Choose an image file for your profile photo.");
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setError("Profile photos must be smaller than 5 MB.");
      return;
    }
    setError(null);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError("Enter the name people should see.");
      return;
    }
    if (!usernameValid) {
      setError("Usernames use 3–24 lowercase letters, numbers or underscores.");
      return;
    }
    if (usernameState === "taken") {
      setError("That username is already taken.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let avatarPath = profile.avatar_path;
      if (file) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(path, file, { upsert: true, cacheControl: "3600" });
        if (uploadError) throw uploadError;
        avatarPath = path;
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: cleanName,
          username,
          avatar_path: avatarPath,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (updateError) {
        if (updateError.code === "23505") {
          throw new Error("That username was just taken. Pick another one.");
        }
        throw updateError;
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const draftProfile = {
    id: profile?.id ?? "draft",
    display_name: name,
    username,
    avatar_path: profile?.avatar_path,
    public_avatar_url: null,
  };

  return (
    <div className="dot-grid flex min-h-screen items-center justify-center bg-background p-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>

        <h1 className="mt-7 text-3xl font-extrabold">Set up your profile</h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          This is how people find and recognise you. You can change everything
          later in Settings.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar profile={preview ? { ...draftProfile, avatar_path: null, public_avatar_url: preview } : draftProfile} size="xl" />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickPhoto}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                className="gap-2"
              >
                <Camera className="size-4" />
                {file ? "Change photo" : "Add a photo"}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Optional. Initials are used if you skip this.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
            >
              Full name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Amara Mensah"
              maxLength={60}
              required
              disabled={saving}
              className="h-11"
            />
          </div>

          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-bold uppercase tracking-[0.1em] text-muted-foreground"
            >
              Username
            </label>
            <div className="flex items-center rounded-lg border border-input bg-background px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
              <span className="text-sm font-semibold text-muted-foreground">@</span>
              <Input
                id="username"
                value={username}
                onChange={(event) => {
                  setUsername(slugify(event.target.value));
                  setUsernameState("idle");
                }}
                onBlur={() => void checkUsername()}
                placeholder="amara"
                maxLength={24}
                required
                disabled={saving}
                className="h-11 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
              />
              {usernameState === "checking" && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {usernameState === "free" && (
                <Check className="size-4 text-emerald-600" />
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {usernameState === "taken"
                ? "That username is taken."
                : usernameState === "invalid"
                  ? "Use 3–24 lowercase letters, numbers or underscores."
                  : "Lowercase letters, numbers and underscores."}
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="h-11 w-full"
            disabled={saving || usernameState === "taken"}
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving profile…
              </>
            ) : (
              "Enter PINGO"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
