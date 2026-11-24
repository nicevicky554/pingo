/**
 * The ONE server-side Supabase service for every PINGO API route.
 *
 * - Uses SUPABASE_URL + SUPABASE_SECRET_KEY (maps to service_role, bypasses RLS).
 * - Never imported by frontend code and never exposed through a VITE_ variable.
 * - The privileged client carries no user session: it never forwards the
 *   caller's Authorization header and never persists a session, so a user token
 *   can never replace the secret-key Authorization header.
 * - Callers are identified by verifying their access token with `authenticate`;
 *   user ids sent in a request body are never trusted.
 */
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

export type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ApiResponse = {
  status: (code: number) => ApiResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cached: SupabaseClient | null = null;

function firstDefined(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim();
}

/** Returns the privileged client, or null when server credentials are absent. */
export function getAdminClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = firstDefined(process.env.SUPABASE_URL);
  const secretKey = firstDefined(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!url || !secretKey) return null;
  cached = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}

export function jsonHeaders(res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
}

export function readJson(req: ApiRequest): Record<string, unknown> {
  try {
    const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function bearerToken(req: ApiRequest) {
  const header = req.headers.authorization;
  return (Array.isArray(header) ? header[0] : header)
    ?.replace(/^Bearer\s+/i, "")
    .trim();
}

export type AuthContext = { admin: SupabaseClient; user: User };

/**
 * Verifies the HTTP method and the caller's Supabase access token. Writes the
 * error response itself and returns null when the request must stop.
 */
export async function authenticate(
  req: ApiRequest,
  res: ApiResponse,
  options: { method?: string; signInMessage?: string } = {},
): Promise<AuthContext | null> {
  jsonHeaders(res);
  if (req.method !== (options.method ?? "POST")) {
    res.status(405).json({ error: "Method not allowed" });
    return null;
  }
  const admin = getAdminClient();
  if (!admin) {
    res.status(500).json({
      error:
        "Server Supabase credentials are not configured (SUPABASE_URL / SUPABASE_SECRET_KEY).",
    });
    return null;
  }
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: options.signInMessage ?? "Sign in to continue." });
    return null;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Your session is no longer valid." });
    return null;
  }
  return { admin, user: data.user };
}

export async function getMembership(
  admin: SupabaseClient,
  conversationId: string,
  userId: string,
) {
  const { data } = await admin
    .from("conversation_members")
    .select("user_id,role")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { user_id: string; role: string } | null;
}

/** Checks a platform admin role on the server; never trust a frontend flag. */
export async function getAdminRole(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("admin_user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}
