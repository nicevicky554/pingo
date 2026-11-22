import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe2,
  Hash,
  ImagePlus,
  Loader2,
  Lock,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

const STEPS = ["Identity", "Access", "Review"];

export default function CreateChannelPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [usernameState, setUsernameState] = useState<"idle" | "free" | "taken">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const usernameValid = /^[a-z0-9_]{3,32}$/.test(username);

  function pickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      setError("Choose an image under 8 MB.");
      return;
    }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  }

  async function checkUsername() {
    if (!usernameValid) return false;
    const { data } = await supabase
      .from("channels")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    const free = !data;
    setUsernameState(free ? "free" : "taken");
    return free;
  }

  async function next() {
    setError(null);
    if (step === 0) {
      if (name.trim().length < 2) {
        setError("Enter a channel name.");
        return;
      }
      if (!usernameValid) {
        setError("Usernames use 3–32 lowercase letters, numbers or underscores.");
        return;
      }
      if (!(await checkUsername())) {
        setError("That channel username is already taken.");
        return;
      }
    }
    setStep((current) => Math.min(2, current + 1));
  }

  async function create() {
    if (!profile || busy) return;
    setBusy(true);
    setError(null);
    try {
      let avatarUrl: string | null = null;
      if (photo) {
        const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.id}/channels/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw uploadError;
        avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const { data, error: insertError } = await supabase
        .from("channels")
        .insert({
          owner_id: profile.id,
          username,
          name: name.trim(),
          description: description.trim() || null,
          is_public: isPublic,
          avatar_url: avatarUrl,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error: memberError } = await supabase
        .from("channel_members")
        .insert({ channel_id: data.id, user_id: profile.id, role: "owner" });
      if (memberError) throw memberError;

      navigate(`/app/channels/${data.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The channel could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader
        title="New channel"
        subtitle={`Step ${step + 1} of ${STEPS.length}`}
        back={() => (step > 0 ? setStep(step - 1) : navigate("/app/updates"))}
      />

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-6">
        <div className="flex gap-1.5">
          {STEPS.map((label, index) => (
            <div key={label} className="flex-1">
              <div
                className={cn(
                  "h-[3px] rounded-full",
                  index <= step ? "bg-primary" : "bg-border",
                )}
              />
              <p className="mt-1.5 text-[0.6rem] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => photoInput.current?.click()}
                className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-secondary text-muted-foreground"
              >
                {preview ? (
                  <img src={preview} alt="Channel" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6" />
                )}
              </button>
              <div>
                <p className="text-sm font-medium">Channel photo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Optional</p>
              </div>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={pickPhoto}
              />
            </div>

            <label className="mt-6 block text-xs font-medium text-muted-foreground">
              Channel name
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="PINGO Design"
              maxLength={80}
              className="mt-1.5 h-10"
              autoFocus
            />

            <label className="mt-5 block text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="What does this channel publish?"
              className="mt-1.5 resize-none"
            />
          </div>
        )}

        {step === 1 && (
          <div className="mt-6">
            <label className="text-xs font-medium text-muted-foreground">
              Channel username
            </label>
            <div className="mt-1.5 flex items-center gap-1 border-b border-input pb-2 focus-within:border-primary">
              <span className="text-sm text-muted-foreground">@</span>
              <input
                value={username}
                onChange={(event) => {
                  setUsername(
                    event.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "")
                      .slice(0, 32),
                  );
                  setUsernameState("idle");
                }}
                onBlur={() => void checkUsername()}
                placeholder="pingo_design"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              {usernameState === "free" && <Check className="size-4 text-online" />}
            </div>
            <p className="mt-1.5 text-[0.7rem] text-muted-foreground">
              {usernameState === "taken"
                ? "That username is taken."
                : "People use this to find and share the channel."}
            </p>

            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3.5 text-left",
                  isPublic ? "border-primary bg-accent/50" : "border-border",
                )}
              >
                <Globe2 className="mt-0.5 size-4 text-primary" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Public channel</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Searchable, with a public @username and link.
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 size-4 rounded-full border-2",
                    isPublic ? "border-primary bg-primary" : "border-input",
                  )}
                />
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3.5 text-left",
                  !isPublic ? "border-primary bg-accent/50" : "border-border",
                )}
              >
                <Lock className="mt-0.5 size-4 text-primary" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Private channel</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Hidden from search. Share it with people directly.
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 size-4 rounded-full border-2",
                    !isPublic ? "border-primary bg-primary" : "border-input",
                  )}
                />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6">
            <div className="flex items-center gap-3 rounded-lg border border-border p-3.5">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-primary">
                {preview ? (
                  <img src={preview} alt="Channel" className="size-full object-cover" />
                ) : (
                  <Hash className="size-6" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{name || "Channel name"}</p>
                <p className="truncate text-xs text-muted-foreground">@{username}</p>
                <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                  {isPublic ? "Public channel" : "Private channel"}
                </p>
              </div>
            </div>
            {description && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
            )}
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              You become the owner. After creation you can publish posts from the
              channel page. No welcome post is created automatically.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="glass safe-bottom flex gap-2 border-x-0 border-b-0 px-4 py-3">
        {step > 0 && (
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setStep(step - 1)}
            disabled={busy}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
        )}
        {step < 2 ? (
          <Button className="flex-1 gap-1.5" onClick={() => void next()}>
            Continue <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => void create()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Create channel"}
          </Button>
        )}
      </div>
    </div>
  );
}
