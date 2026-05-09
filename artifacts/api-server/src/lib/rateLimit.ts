interface Bucket {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

export function checkLoginRate(key: string): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return { allowed: true, retryAfterSec: 0 };
  if (b.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  if (now - b.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count >= MAX_ATTEMPTS) {
    b.lockedUntil = now + LOCKOUT_MS;
    return { allowed: false, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && now - b.firstAt > WINDOW_MS) {
      buckets.delete(k);
    }
  }
}, 60 * 1000).unref?.();
