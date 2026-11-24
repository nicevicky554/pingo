/**
 * Server-only helpers for PINGO phone sign-in.
 *
 * The six-digit code is generated and verified here (never in the browser).
 * It is delivered through Twilio's WhatsApp channel, stored only as an HMAC in
 * `public.phone_otp_codes`, and exchanged for a real Supabase session with a
 * server-generated magic-link token hash after successful verification.
 *
 * Nothing in this file may be imported by client code.
 */

import {
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

export const OTP_TTL_SECONDS = Math.min(
  900,
  Math.max(120, Number(process.env.OTP_TTL_SECONDS ?? 300)),
);
export const MAX_OTP_ATTEMPTS = 5;

const PHONE = /^\+[1-9]\d{6,14}$/;
const DIGITS = /^\d{6}$/;

function pick(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value && value.trim().length > 0));
}

/** Strip formatting and reject anything that is not a plausible E.164 number. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\s\-().]/g, "");
  return PHONE.test(cleaned) ? cleaned : null;
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s/g, "");
  return DIGITS.test(cleaned) ? cleaned : null;
}

export function newCode() {
  return String(randomInt(100_000, 1_000_000));
}

export function hashCode(phone: string, code: string) {
  const secret = pick(
    process.env.OTP_HASH_SECRET,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!secret) throw new Error("Missing OTP hashing secret.");
  return createHmac("sha256", secret)
    .update(`${phone}:${code}`)
    .digest("hex");
}

/** Length-safe constant-time comparison of two hex digests. */
export function sameHash(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export type ServerSupabase = {
  admin: SupabaseClient;
  url: string;
  secret: string;
};

export function serverSupabase(): ServerSupabase | null {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = pick(
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!url || !secret) return null;
  return {
    url,
    secret,
    admin: createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export type TwilioWhatsAppConfig = {
  accountSid: string;
  username: string;
  password: string;
  from?: string;
  messagingServiceSid?: string;
  contentSid?: string;
  contentVariable: string;
};

/**
 * Twilio accepts either Account SID + Auth Token, or an API Key SID + secret.
 * The WhatsApp sender must be an approved `whatsapp:+<number>`.
 */
export function twilioWhatsAppConfig(): {
  config: TwilioWhatsAppConfig | null;
  missing: string[];
} {
  const accountSid = pick(process.env.TWILIO_ACCOUNT_SID);
  const apiKey = pick(process.env.TWILIO_API_KEY);
  const apiSecret = pick(process.env.TWILIO_API_SECRET);
  const authToken = pick(process.env.TWILIO_AUTH_TOKEN);
  const rawFrom = pick(
    process.env.TWILIO_WHATSAPP_FROM,
    process.env.TWILIO_WHATSAPP_NUMBER,
    process.env.TWILIO_WHATSAPP_SENDER,
    process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER,
    process.env.TWILIO_PHONE_NUMBER,
  );
  const messagingServiceSid = pick(
    process.env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID,
    process.env.TWILIO_MESSAGING_SERVICE_SID,
  );

  const missing: string[] = [];
  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!apiKey && !authToken) missing.push("TWILIO_API_KEY");
  if (apiKey && !apiSecret) missing.push("TWILIO_API_SECRET");
  if (!rawFrom && !messagingServiceSid) {
    missing.push(
      "TWILIO_WHATSAPP_FROM (for example whatsapp:+14155238886), or TWILIO_MESSAGING_SERVICE_SID",
    );
  }

  if (missing.length > 0) return { config: null, missing };

  let sender: string | undefined;
  if (rawFrom) {
    sender = rawFrom.startsWith("whatsapp:")
      ? rawFrom
      : `whatsapp:${rawFrom.replace(/^whatsapp:/, "")}`;
    if (!/^whatsapp:\+[1-9]\d{6,14}$/.test(sender)) {
      return {
        config: null,
        missing: [
          "TWILIO_WHATSAPP_FROM (must be an approved sender like whatsapp:+14155238886)",
        ],
      };
    }
  }

  return {
    config: {
      accountSid: accountSid!,
      username: (apiKey ?? accountSid)!,
      password: (apiSecret ?? authToken)!,
      from: sender,
      messagingServiceSid,
      contentSid: pick(process.env.TWILIO_WHATSAPP_CONTENT_SID),
      contentVariable:
        pick(process.env.TWILIO_WHATSAPP_CONTENT_VARIABLE) ?? "1",
    },
    missing: [],
  };
}

export type WhatsAppResult =
  | { ok: true; sid: string | null }
  | { ok: false; error: string; code?: string };

export async function sendWhatsAppCode(
  to: string,
  code: string,
): Promise<WhatsAppResult> {
  const { config, missing } = twilioWhatsAppConfig();
  if (!config) {
    return {
      ok: false,
      error: `WhatsApp delivery is not configured on the server. Missing: ${missing.join(", ")}.`,
      code: "not_configured",
    };
  }

  const body = new URLSearchParams({ To: `whatsapp:${to}` });
  if (config.messagingServiceSid) {
    body.set("MessagingServiceSid", config.messagingServiceSid);
  } else if (config.from) {
    body.set("From", config.from);
  }

  // Production WhatsApp senders require an approved template outside the
  // 24-hour customer window. The sandbox (and an open session) accepts Body.
  if (config.contentSid) {
    body.set("ContentSid", config.contentSid);
    body.set(
      "ContentVariables",
      JSON.stringify({ [config.contentVariable]: code }),
    );
  } else {
    body.set(
      "Body",
      `Your PINGO verification code is ${code}. It expires in ${Math.round(
        OTP_TTL_SECONDS / 60,
      )} minutes. Never share this code with anyone.`,
    );
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${config.username}:${config.password}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(9_000),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      sid?: string;
      code?: number | string;
      message?: string;
    } | null;

    if (!response.ok) {
      console.error(
        "[PINGO] Twilio WhatsApp send failed",
        response.status,
        payload?.code,
        payload?.message,
      );
      return {
        ok: false,
        error:
          payload?.message?.slice(0, 240) ??
          `WhatsApp delivery failed (HTTP ${response.status}).`,
        code: payload?.code != null ? String(payload.code) : undefined,
      };
    }
    return { ok: true, sid: payload?.sid ?? null };
  } catch (error) {
    console.error(
      "[PINGO] Twilio WhatsApp request error",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      error: "Could not reach WhatsApp delivery. Try again shortly.",
    };
  }
}

/** Deterministic, non-deliverable address used only to mint a Supabase session. */
function sessionEmail(phone: string, suffix = "") {
  const digits = phone.replace(/\D/g, "");
  return `p${digits}${suffix}@phone.pingo.app`;
}

async function getUserIdByPhone(admin: SupabaseClient, phone: string) {
  const digits = phone.replace(/\D/g, "");

  const { data: profile } = await admin
    .from("profiles")
    .select("id,phone")
    .eq("phone", phone)
    .maybeSingle();
  if (profile?.id) {
    const { data } = await admin.auth.admin.getUserById(profile.id);
    if (data?.user) return data.user;
  }

  // Safety net for accounts whose profile phone was never mirrored.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) break;
    const match = data.users.find(
      (user) => user.phone?.replace(/\D/g, "") === digits,
    );
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function confirmEmail(admin: SupabaseClient, user: User) {
  if (!user.email) return null;
  if (user.email_confirmed_at) return user.email;
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    email: user.email,
    email_confirm: true,
  });
  if (error) return null;
  return data.user?.email ?? user.email;
}

/**
 * Find the Supabase user that owns this verified phone number, creating one on
 * first registration. Email only exists to hold the session token; the phone
 * number stays the visible identity and is mirrored into `profiles.phone`.
 */
export async function ensureAuthUser(admin: SupabaseClient, phone: string) {
  let user = await getUserIdByPhone(admin, phone);

  if (user) {
    const confirmed = await confirmEmail(admin, user);
    if (confirmed) return { user, email: confirmed };

    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      email: sessionEmail(phone),
      email_confirm: true,
    });
    if (!error && data.user?.email) {
      return { user: data.user, email: data.user.email };
    }
    const { data: fallback, error: fallbackError } =
      await admin.auth.admin.updateUserById(user.id, {
        email: sessionEmail(phone, `.${user.id.slice(0, 8)}`),
        email_confirm: true,
      });
    if (fallbackError || !fallback.user?.email) {
      throw new Error(
        "This account exists but could not be prepared for phone sign-in. Contact support.",
      );
    }
    return { user: fallback.user, email: fallback.user.email };
  }

  const email = sessionEmail(phone);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    phone,
    phone_confirm: true,
    user_metadata: { phone },
  });
  if (!error && data.user) return { user: data.user, email };

  // Environments that keep Supabase's SMS phone provider disabled must still
  // be able to register: create the account on its email identity, then attach
  // the verified phone when the project allows it.
  const emailOnly = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { phone },
  });
  if (!emailOnly.error && emailOnly.data.user) {
    const attached = await admin.auth.admin.updateUserById(
      emailOnly.data.user.id,
      { phone, phone_confirm: true },
    );
    return {
      user: attached.data?.user ?? emailOnly.data.user,
      email,
    };
  }

  // Another worker may have created the account between lookup and insert.
  user = await getUserIdByPhone(admin, phone);
  if (user) {
    const confirmed = await confirmEmail(admin, user);
    if (confirmed) return { user, email: confirmed };
  }
  throw new Error(
    error?.message?.includes("already") ||
      emailOnly.error?.message?.includes("already")
      ? "This number is already registered. Try signing in again."
      : "Could not create your account. Try again shortly.",
  );
}

/** Mint the single-use token hash the browser exchanges for a session. */
export async function createSessionToken(
  admin: SupabaseClient,
  email: string,
) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    throw new Error(
      "Sign-in could not be completed. Enable the Email provider in Supabase Auth so a session can be issued.",
    );
  }
  return tokenHash;
}

export function clientIp(headers: Record<string, string | string[] | undefined>) {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(",")[0]?.trim() || "unknown";
}

export function readJsonBody(body: unknown): Record<string, unknown> {
  if (typeof body === "string") {
    try {
      return (JSON.parse(body) ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (body ?? {}) as Record<string, unknown>;
}
