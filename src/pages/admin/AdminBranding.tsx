import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useBranding, type BrandingAssets } from "@/providers/BrandingProvider";
import { cn } from "@/lib/utils";
import { Check, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const ASSETS: {
  key: keyof BrandingAssets;
  label: string;
  hint: string;
  darkSurface?: boolean;
}[] = [
  { key: "app_icon_url", label: "Application icon", hint: "Square, at least 512×512" },
  { key: "light_logo_url", label: "Light-theme logo", hint: "Transparent PNG or SVG" },
  {
    key: "dark_logo_url",
    label: "Dark-theme logo",
    hint: "Transparent PNG or SVG",
    darkSurface: true,
  },
  { key: "splash_icon_url", label: "Splash icon", hint: "Square, at least 512×512" },
  {
    key: "splash_background_url",
    label: "Splash background",
    hint: "Portrait image, optional",
  },
  { key: "default_avatar_url", label: "Default user avatar", hint: "Square image" },
  { key: "default_group_url", label: "Default group image", hint: "Square image" },
  { key: "default_channel_url", label: "Default channel image", hint: "Square image" },
  {
    key: "default_community_url",
    label: "Default community image",
    hint: "Square image",
  },
  { key: "nav_chats_url", label: "Chats navigation icon", hint: "Transparent SVG/PNG" },
  { key: "nav_updates_url", label: "Updates navigation icon", hint: "Transparent SVG/PNG" },
  {
    key: "nav_communities_url",
    label: "Communities navigation icon",
    hint: "Transparent SVG/PNG",
  },
  { key: "nav_calls_url", label: "Calls navigation icon", hint: "Transparent SVG/PNG" },
  {
    key: "nav_settings_url",
    label: "Settings navigation icon",
    hint: "Transparent SVG/PNG",
  },
  { key: "verified_badge_url", label: "Verified badge", hint: "Small transparent SVG/PNG" },
];

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

function sanitizeSvg(source: string): Blob {
  const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = documentNode.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    throw new Error("That SVG could not be read.");
  }
  root.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => {
    node.remove();
  });
  const walk = (element: Element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "xlink:href") && value.startsWith("javascript:"))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
    Array.from(element.children).forEach(walk);
  };
  walk(root);
  return new Blob([new XMLSerializer().serializeToString(root)], {
    type: "image/svg+xml",
  });
}

export default function AdminBranding() {
  const { profile, adminRole } = useAuth();
  const { assets, refresh } = useBranding();
  const [draft, setDraft] = useState<BrandingAssets>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [reason, setReason] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setDraft(assets);
  }, [assets]);

  const canManage =
    adminRole === "super_admin" ||
    adminRole === "system_admin" ||
    adminRole === "security_admin";

  async function upload(key: keyof BrandingAssets, file: File) {
    if (!profile || !canManage) return;
    if (!TYPES.includes(file.type)) {
      toast.error("Use PNG, JPEG, WebP or SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Assets must be smaller than 4 MB.");
      return;
    }
    setBusyKey(key);
    try {
      let body: Blob = file;
      if (file.type === "image/svg+xml") {
        body = sanitizeSvg(await file.text());
      }
      const extension =
        file.type === "image/svg+xml"
          ? "svg"
          : file.type === "image/png"
            ? "png"
            : file.type === "image/webp"
              ? "webp"
              : "jpg";
      const path = `${profile.id}/branding/${key}-${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, body, { contentType: file.type, upsert: false });
      if (error) throw error;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      setDraft((current) => ({ ...current, [key]: url }));
      setPublished(false);
      toast.success("Asset uploaded. Publish to apply it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function publish() {
    if (!canManage) return;
    setPublishing(true);
    const { error } = await supabase.rpc("set_platform_branding", {
      next_branding: draft,
      reason:
        reason.trim() || "Published branding from Admin → Platform branding",
    });
    setPublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    setPublished(true);
    toast.success("Branding published.");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Platform branding
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload assets, preview them, then publish. Published assets are read
            by the splash screen, login and application shell.
          </p>
        </div>
        <Button onClick={() => void publish()} disabled={publishing}>
          {publishing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Publish branding
        </Button>
      </div>

      {published && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
          Branding published. Returning users receive it on the next app load.
        </p>
      )}

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Splash preview</p>
          <div
            className="mt-2 flex h-44 flex-col items-center justify-center overflow-hidden rounded-lg bg-background bg-cover bg-center"
            style={
              draft.splash_background_url
                ? { backgroundImage: `url(${draft.splash_background_url})` }
                : undefined
            }
          >
            {draft.splash_icon_url || draft.app_icon_url ? (
              <img
                src={draft.splash_icon_url || draft.app_icon_url}
                alt="Splash"
                className="size-16 object-contain"
              />
            ) : (
              <BrandLogo kind="splash" className="size-16" />
            )}
            <span className="mt-3 text-sm font-semibold tracking-[-0.03em]">PINGO</span>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Light / dark logo</p>
          <div className="mt-2 grid h-44 grid-cols-2 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-center bg-white p-4">
              {draft.light_logo_url ? (
                <img src={draft.light_logo_url} alt="Light logo" className="max-h-14 max-w-full" />
              ) : (
                <BrandLogo className="size-12" />
              )}
            </div>
            <div className="flex items-center justify-center bg-[#101820] p-4">
              {draft.dark_logo_url ? (
                <img src={draft.dark_logo_url} alt="Dark logo" className="max-h-14 max-w-full" />
              ) : (
                <BrandLogo className="size-12" />
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ASSETS.map((asset) => (
          <div
            key={asset.key}
            className={cn(
              "rounded-xl border border-border bg-card p-4",
              asset.darkSurface && "bg-[#101820] text-white",
            )}
          >
            <p className="text-sm font-medium">{asset.label}</p>
            <p
              className={cn(
                "mt-0.5 text-[0.68rem] text-muted-foreground",
                asset.darkSurface && "text-white/60",
              )}
            >
              {asset.hint}
            </p>
            <div className="mt-3 flex h-24 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-background/60">
              {draft[asset.key] ? (
                <img src={draft[asset.key]} alt={asset.label} className="max-h-24 max-w-full object-contain" />
              ) : (
                <ImagePlus className="size-5 text-muted-foreground" />
              )}
            </div>
            <input
              ref={(node) => {
                inputs.current[asset.key] = node;
              }}
              type="file"
              accept={TYPES.join(",")}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(asset.key, file);
              }}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled={!canManage || busyKey === asset.key}
                onClick={() => inputs.current[asset.key]?.click()}
              >
                {busyKey === asset.key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="size-3.5" />
                )}
                Replace
              </Button>
              {draft[asset.key] && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${asset.label}`}
                  onClick={() => {
                    setDraft((current) => {
                      const next = { ...current };
                      delete next[asset.key];
                      return next;
                    });
                    setPublished(false);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <label className="text-xs font-medium text-muted-foreground">
          Publish reason (recorded in the audit log)
        </label>
        <Input
          className="mt-2"
          placeholder="Why is this branding changing?"
          id="branding-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
          SVG files are parsed and stripped of scripts, external documents and
          event attributes before upload. Only super, system and security admins
          can publish.
        </p>
      </section>
    </div>
  );
}
