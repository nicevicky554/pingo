import { UserAvatar } from "@/components/UserAvatar";
import { PingoMark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  LogOut,
  UsersRound,
} from "lucide-react";
import { useRef, useState } from "react";

const STEPS = ["Your details", "Your photo", "Contacts", "Finish"];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 24);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export default function Onboarding() {
  const { profile, refresh, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [about, setAbout] = useState(profile?.about ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [usernameState, setUsernameState] = useState<
    "idle" | "free" | "taken" | "invalid"
  >("idle");
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [contactsNote, setContactsNote] = useState<string | null>(null);

  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const usernameValid = /^[a-z0-9_]{3,24}$/.test(username);

  async function checkUsername() {
    if (!usernameValid) {
      setUsernameState("invalid");
      return false;
    }
    setChecking(true);
    const { data, error: queryError } = await supabase
      .from("public_profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    setChecking(false);
    if (queryError) {
      setUsernameState("idle");
      return true;
    }
    const taken = Boolean(data && data.id !== profile?.id);
    setUsernameState(taken ? "taken" : "free");
    return !taken;
  }

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (next.size > 8 * 1024 * 1024) {
      setError("Choose an image smaller than 8 MB.");
      return;
    }
    setError(null);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }

  async function croppedBlob(): Promise<Blob | null> {
    if (!file || !preview) return null;
    const image = await loadImage(preview);
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const base = Math.max(size / image.width, size / image.height) * zoom;
    const width = image.width * base;
    const height = image.height * base;
    const dx = (size - width) / 2 + (offsetX / 100) * (size / 2);
    const dy = (size - height) / 2 + (offsetY / 100) * (size / 2);
    context.drawImage(image, dx, dy, width, height);
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9),
    );
  }

  async function next() {
    setError(null);
    if (step === 0) {
      if (name.trim().length < 2) {
        setError("Enter the name people should see.");
        return;
      }
      if (!usernameValid) {
        setError("Usernames use 3–24 lowercase letters, numbers or underscores.");
        return;
      }
      const free = await checkUsername();
      if (!free) {
        setError("That username is already taken.");
        return;
      }
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function allowContacts() {
    const picker = (navigator as unknown as {
      contacts?: { select: (fields: string[], options: object) => Promise<unknown[]> };
    }).contacts;
    if (!picker) {
      setContactsNote(
        "Contact picking is not available in this browser. You can skip this step; nothing is uploaded.",
      );
      return;
    }
    try {
      const selected = await picker.select(["name", "tel"], { multiple: true });
      setContactCount(selected.length);
      setContactsNote(
        `${selected.length} contact${selected.length === 1 ? "" : "s"} selected on this device. Nothing was uploaded to PINGO.`,
      );
    } catch {
      setContactsNote("Contact access was dismissed. You can skip this step.");
    }
  }

  async function finish() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      let avatarPath = profile.avatar_path;
      if (file) {
        const blob = await croppedBlob();
        if (blob) {
          const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from("profile-photos")
            .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (uploadError) throw uploadError;
          avatarPath = path;
        }
      }

      const testPhone = window.localStorage.getItem("pingo:test_phone");
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          display_name: name.trim(),
          username,
          about: about.trim(),
          avatar_path: avatarPath,
          phone: testPhone ?? profile.phone ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id);
      if (updateError) {
        if (updateError.code === "23505") {
          throw new Error("That username was just taken. Go back and choose another.");
        }
        throw updateError;
      }
      window.localStorage.removeItem("pingo:test_phone");
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
    avatar_path: preview ? null : profile?.avatar_path,
    public_avatar_url: preview,
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-lg items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <PingoMark className="size-7" />
          <span className="text-xs font-semibold tracking-[0.12em]">PINGO</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void signOut()}
          className="gap-1.5 text-muted-foreground"
        >
          <LogOut className="size-4" /> Sign out
        </Button>
      </header>

      <main className="mx-auto w-full max-w-[420px] flex-1 px-6 py-8">
        <div className="flex gap-1.5">
          {STEPS.map((label, index) => (
            <div key={label} className="flex-1">
              <div
                className={cn(
                  "h-[3px] rounded-full transition-colors",
                  index <= step ? "bg-primary" : "bg-border",
                )}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[0.68rem] font-medium text-muted-foreground">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        {step === 0 && (
          <div className="mt-7">
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em]">
              Your profile
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              This is how people find and recognise you on PINGO.
            </p>

            <div className="mt-7 space-y-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Full name
                </label>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Amara Mensah"
                  maxLength={60}
                  className="mt-1.5 h-10"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Username
                </label>
                <div className="mt-1.5 flex items-center border-b border-input pb-2 focus-within:border-primary">
                  <span className="text-sm text-muted-foreground">@</span>
                  <Input
                    value={username}
                    onChange={(event) => {
                      setUsername(slugify(event.target.value));
                      setUsernameState("idle");
                    }}
                    onBlur={() => void checkUsername()}
                    placeholder="amara"
                    maxLength={24}
                    className="h-8 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                  />
                  {checking && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {usernameState === "free" && (
                    <Check className="size-4 text-online" />
                  )}
                </div>
                <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
                  {usernameState === "taken"
                    ? "That username is taken."
                    : "Letters, numbers and underscores. This is how people find you."}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  About <span className="font-normal">(optional)</span>
                </label>
                <Textarea
                  value={about}
                  onChange={(event) => setAbout(event.target.value)}
                  placeholder="A short line about you"
                  maxLength={160}
                  rows={2}
                  className="mt-1.5 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-7">
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em]">
              Add a profile photo
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Optional. If you skip it, PINGO shows your initials with a stable
              colour.
            </p>

            <div className="mt-8 flex justify-center">
              <div className="relative size-56 overflow-hidden rounded-full border border-border bg-secondary">
                {preview ? (
                  <img
                    src={preview}
                    alt="Profile preview"
                    className="size-full object-cover"
                    style={{
                      transform: `translate(${offsetX}%, ${offsetY}%) scale(${zoom})`,
                    }}
                  />
                ) : (
                  <UserAvatar
                    profile={draftProfile}
                    size="xl"
                    className="size-full [&>span]:size-full"
                  />
                )}
              </div>
            </div>

            {preview && (
              <div className="mt-5 space-y-3">
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-14 shrink-0">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={2.2}
                    step={0.02}
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="flex-1 accent-[var(--primary)]"
                  />
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-14 shrink-0">Horizontal</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={offsetX}
                    onChange={(event) => setOffsetX(Number(event.target.value))}
                    className="flex-1 accent-[var(--primary)]"
                  />
                </label>
                <label className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="w-14 shrink-0">Vertical</span>
                  <input
                    type="range"
                    min={-50}
                    max={50}
                    value={offsetY}
                    onChange={(event) => setOffsetY(Number(event.target.value))}
                    className="flex-1 accent-[var(--primary)]"
                  />
                </label>
              </div>
            )}

            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={pickPhoto}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={pickPhoto}
            />

            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => photoInput.current?.click()}
              >
                <ImagePlus className="size-4" /> Upload
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => cameraInput.current?.click()}
              >
                <Camera className="size-4" /> Camera
              </Button>
            </div>
            {preview && (
              <Button
                variant="ghost"
                className="mt-2 w-full text-muted-foreground"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                Remove photo
              </Button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="mt-7">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
              <UsersRound className="size-5" />
            </span>
            <h1 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.02em]">
              Find people you know
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              PINGO can use your device's contact picker to help you start a chat.
              Your address book is never uploaded in plaintext, and this is
              optional.
            </p>

            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => void allowContacts()}
            >
              <UsersRound className="size-4" /> Open contact picker
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full text-muted-foreground"
              onClick={() => setStep(3)}
            >
              Not now
            </Button>

            {contactCount !== null && (
              <p className="mt-4 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                {contactCount} contact{contactCount === 1 ? "" : "s"} available on
                this device. Nothing was uploaded.
              </p>
            )}
            {contactsNote && (
              <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs leading-5 text-muted-foreground">
                {contactsNote}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="mt-7">
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em]">
              You're ready
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Check your details, then enter PINGO.
            </p>

            <div className="mt-7 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <UserAvatar profile={draftProfile} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {name || "Your name"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  @{username || "username"}
                </p>
                {about && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {about}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-5 rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8 flex gap-2">
          {step > 0 && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => setStep((current) => current - 1)}
              disabled={saving}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button className="flex-1 gap-1.5" onClick={() => void next()}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={() => void finish()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : (
                "Enter PINGO"
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
