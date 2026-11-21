interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory token-bucket rate limiter.
 * Defaults to 5 requests/min per key (DEPLOYOPS_RATE_LIMIT_PER_MIN).
 */
export function rateLimit(
  key: string,
  perMinute = Number(process.env.DEPLOYOPS_RATE_LIMIT_PER_MIN ?? 5),
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const capacity = perMinute;
  const refillRate = capacity / 60_000;
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const resetMs = Math.ceil((1 - bucket.tokens) / refillRate);
    return { allowed: false, remaining: 0, resetMs };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { allowed: true, remaining: Math.floor(bucket.tokens), resetMs: 0 };
}
