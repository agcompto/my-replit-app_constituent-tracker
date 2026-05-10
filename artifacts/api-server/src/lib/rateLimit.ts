interface Bucket {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 5;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface Opts {
  maxAttempts?: number;
  windowMs?: number;
  lockoutMs?: number;
}

function checkRate(key: string, opts: Opts = {}): RateLimitResult {
  const now = Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const b = buckets.get(key);
  if (!b) return { allowed: true, retryAfterSec: 0 };
  if (b.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  if (now - b.firstAt > windowMs) {
    buckets.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailure(key: string, opts: Opts = {}): RateLimitResult {
  const now = Date.now();
  const max = opts.maxAttempts ?? DEFAULT_MAX;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const lockoutMs = opts.lockoutMs ?? DEFAULT_LOCKOUT_MS;
  const b = buckets.get(key);
  if (!b || now - b.firstAt > windowMs) {
    buckets.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return { allowed: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count >= max) {
    b.lockedUntil = now + lockoutMs;
    return { allowed: false, retryAfterSec: Math.ceil(lockoutMs / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordSuccess(key: string): void {
  buckets.delete(key);
}

// Login: per (email, ip) — 5 attempts / 15min, 15min lockout
export function checkLoginRate(emailIp: string): RateLimitResult {
  return checkRate(`login|${emailIp}`);
}
export function recordLoginFailure(emailIp: string): RateLimitResult {
  return recordFailure(`login|${emailIp}`);
}
export function recordLoginSuccess(emailIp: string): void {
  recordSuccess(`login|${emailIp}`);
}

// Change own password: per (userId, ip) — same defaults
export function checkChangePasswordRate(userId: number, ip: string): RateLimitResult {
  return checkRate(`cp|${userId}|${ip}`);
}
export function recordChangePasswordFailure(userId: number, ip: string): RateLimitResult {
  return recordFailure(`cp|${userId}|${ip}`);
}
export function recordChangePasswordSuccess(userId: number, ip: string): void {
  recordSuccess(`cp|${userId}|${ip}`);
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && now - b.firstAt > DEFAULT_WINDOW_MS) {
      buckets.delete(k);
    }
  }
}, 60 * 1000).unref?.();
