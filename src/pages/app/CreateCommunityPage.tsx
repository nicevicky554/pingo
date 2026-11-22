import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { ImagePlus, Loader2, UsersRound } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

export default function CreateCommunityPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function create() {
    if (!profile || name.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      let imageUrl: string | null = null;
      if (photo) {
        const extension = photo.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${profile.id}/communities/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, photo, { contentType: photo.type });
        if (uploadError) throw uploadError;
        imageUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }
      const { data, error: insertError } = await supabase
        .from("communities")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
          owner_id: profile.id,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      await supabase.from("community_members").insert({
        community_id: data.id,
        user_id: profile.id,
        role: "owner",
      });
      navigate("/app/communities", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The community could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-enter flex min-h-0 flex-1 flex-col bg-card">
      <PageHeader title="New community" back="/app/communities" />
      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 py-6">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex size-20 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-secondary text-muted-foreground"
          >
            {preview ? (
              <img src={preview} alt="Community" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6" />
            )}
          </button>
          <div>
            <p className="text-sm font-medium">Community image</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Optional</p>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setPhoto(file);
              setPreview(URL.createObjectURL(file));
            }}
          />
        </div>

        <label className="mt-6 block text-xs font-medium text-muted-foreground">
          Community name
        </label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Lagos Creators"
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
          placeholder="What connects these groups?"
          className="mt-1.5 resize-none"
        />

        <div className="mt-5 flex items-start gap-2 rounded-md bg-secondary px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          <UsersRound className="mt-0.5 size-4 shrink-0 text-primary" />
          You become the owner. Add existing groups to this community from the
          community page after creation.
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          className="mt-6 w-full"
          onClick={() => void create()}
          disabled={busy || name.trim().length < 2}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Create community
        </Button>
      </div>
    </div>
  );
}
