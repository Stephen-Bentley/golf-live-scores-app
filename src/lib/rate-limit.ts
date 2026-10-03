/**
 * Simple in-memory rate limiter for API routes (per process).
 * Good enough for single-node deploy; swap for Redis in multi-instance.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((existing.resetAt - now) / 1000),
    };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    retryAfterSec: 0,
  };
}

/** Test helper */
export function clearRateLimits() {
  buckets.clear();
}
