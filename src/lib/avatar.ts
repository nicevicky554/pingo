/** Deterministic avatar helpers — the same account always gets the same look. */

const PALETTE = [
  { bg: "#126B78", fg: "#EAFBF8" },
  { bg: "#1F8A7A", fg: "#ECFFF9" },
  { bg: "#2C5F8A", fg: "#EBF5FF" },
  { bg: "#7A5A2E", fg: "#FFF8EA" },
  { bg: "#6B4A72", fg: "#FBF0FF" },
  { bg: "#2F6B4F", fg: "#EFFFF5" },
  { bg: "#87503F", fg: "#FFF2EC" },
  { bg: "#4A5C7A", fg: "#EFF4FF" },
];

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i++) {
    value = (value * 31 + input.charCodeAt(i)) >>> 0;
  }
  return value;
}

export function initialsFor(name?: string | null, username?: string | null) {
  const source = (name || username || "").trim();
  if (!source) return "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function avatarColour(id: string) {
  return PALETTE[hash(id) % PALETTE.length];
}

import { supabase } from "@/lib/supabase";

let cache = new Map<string, { url: string; expires: number }>();

/** Resolve a private profile photo path to a short-lived signed URL. */
export async function resolvePrivatePhoto(
  bucket: string,
  path: string,
): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  cache.set(key, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export function clearAvatarCache() {
  cache = new Map();
}
