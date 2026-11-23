/**
 * Vercel serverless function: POST/GET /api/turn
 *
 * Verifies the caller's Supabase access token, then mints short-lived Twilio
 * Network Traversal Service credentials. Provider secrets never reach the
 * browser. When Twilio is not configured the endpoint reports that clearly and
 * the client continues with STUN only.
 */

type NodeRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type NodeResponse = {
  status: (code: number) => NodeResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

function pick(...values: Array<string | undefined>) {
  return values.find((value) => value && value.length > 0);
}

export default async function handler(req: NodeRequest, res: NodeResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method && req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = pick(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL);
  const anonKey = pick(
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  const header = req.headers.authorization;
  const token = (Array.isArray(header) ? header[0] : header)?.replace(
    /^Bearer\s+/i,
    "",
  );

  if (!supabaseUrl || !anonKey) {
    res.status(500).json({ error: "Supabase server configuration is missing." });
    return;
  }
  if (!token) {
    res.status(401).json({ error: "Sign in before requesting call credentials." });
    return;
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) {
    res.status(401).json({ error: "Your session is no longer valid." });
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (!accountSid || !apiKey || !apiSecret) {
    res.status(200).json({
      iceServers: [],
      configured: false,
      message:
        "TURN is not configured. Add TWILIO_ACCOUNT_SID, TWILIO_API_KEY and TWILIO_API_SECRET in the hosting environment to relay calls on restrictive networks.",
    });
    return;
  }

  try {
    const ttl = Math.min(
      86_400,
      Math.max(300, Number(process.env.TWILIO_TURN_TTL ?? 3600)),
    );
    const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ Ttl: String(ttl) }).toString(),
      },
    );

    if (!twilioResponse.ok) {
      const detail = await twilioResponse.text();
      console.error("[PINGO] Twilio TURN error", twilioResponse.status, detail);
      res.status(502).json({
        iceServers: [],
        configured: true,
        error: "The TURN provider rejected the credential request.",
      });
      return;
    }

    const payload = (await twilioResponse.json()) as {
      ice_servers?: Array<{
        url?: string;
        urls?: string;
        username?: string;
        credential?: string;
      }>;
    };

    const iceServers = (payload.ice_servers ?? [])
      .map((server) => ({
        urls: server.url ?? server.urls ?? "",
        username: server.username,
        credential: server.credential,
      }))
      .filter((server) => server.urls.length > 0);

    res.status(200).json({ iceServers, configured: true, ttl });
  } catch (error) {
    console.error("[PINGO] TURN request failed", error);
    res.status(502).json({ iceServers: [], configured: true, error: "TURN unavailable." });
  }
}
