// In-memory, per-instance rate limiter. On Vercel this state is scoped to
// one serverless instance (not shared globally), so it's a coarse defense
// against a single client hammering an endpoint rather than a precise
// global limit. That's an acceptable tradeoff for now: zero setup, zero
// extra cost, and it directly reduces repeated Supabase calls from any one
// abusive client. Swap for a shared store (e.g. Upstash Redis) if/when
// accurate per-API-key limits are needed for the paid tier.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5000;

function pruneExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  { windowMs, max }: { windowMs: number; max: number }
): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  if (buckets.size > MAX_TRACKED_KEYS) pruneExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { limited: false, remaining: max - 1, resetAt };
  }

  bucket.count += 1;
  return {
    limited: bucket.count > max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
