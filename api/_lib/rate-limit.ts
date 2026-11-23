/**
 * Optional Upstash Redis rate limiting for server routes.
 *
 * PostgreSQL remains authoritative. Redis only stores short-lived counters and
 * never message/account data. If Upstash is not configured the caller proceeds;
 * this is an abuse control, not an authorization check.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return { allowed: true, remaining: limit };

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds, "NX"],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return { allowed: true, remaining: limit };
    const result = (await response.json()) as Array<{ result?: number; error?: string }>;
    const count = Number(result?.[0]?.result ?? 0);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  } catch {
    // Never take down messaging because Redis is unavailable.
    return { allowed: true, remaining: limit };
  }
}
