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

// ──────────────────────────────────────────────────────────────────────────
// Generic per-key sliding-window counter (used for AI per-minute throttling).
// Distinct from the lockout-style buckets above: this counts requests in a
// rolling window and rejects once `max` is exceeded for `windowMs`.
// ──────────────────────────────────────────────────────────────────────────
interface SlidingBucket {
  timestamps: number[];
  // The window length the bucket was created with. Stored per-bucket so the
  // periodic cleanup task can prune correctly even when different callers
  // use different windows (e.g. AI per-minute vs export-per-hour vs
  // forgot-password 15-minute). Without this, a single hardcoded purge
  // horizon would drop still-relevant timestamps for the longer-windowed
  // keys and silently weaken the throttle.
  windowMs: number;
}
const slidingBuckets = new Map<string, SlidingBucket>();

export function checkSlidingRate(
  key: string,
  max: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const b = slidingBuckets.get(key);
  if (!b) {
    slidingBuckets.set(key, { timestamps: [now], windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  // If a caller ever uses the same key with a different window, take the
  // larger one so the cleanup horizon stays safe.
  if (windowMs > b.windowMs) b.windowMs = windowMs;
  // Drop expired timestamps
  while (b.timestamps.length > 0 && b.timestamps[0] < cutoff) {
    b.timestamps.shift();
  }
  if (b.timestamps.length >= max) {
    const oldest = b.timestamps[0];
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }
  b.timestamps.push(now);
  return { allowed: true, retryAfterSec: 0 };
}

// AI per-user throttle: 10 calls / minute
export function checkAiPerMinute(userId: number): RateLimitResult {
  return checkSlidingRate(`ai|user|${userId}`, 10, 60_000);
}

// Password-setup link validation per-IP cap: 30 GETs / 15 minutes. Tokens
// are 256-bit so brute force is infeasible regardless, but this stops noisy
// scanning and keeps the DB lookup cheap.
export function checkPasswordSetupGetPerIp(ip: string): RateLimitResult {
  return checkSlidingRate(`pwsetup-get|ip|${ip}`, 30, 15 * 60_000);
}

// Per-user export quota: 20 exports / hour. Defends against an
// account-takeover dump-and-run on the audience CSVs.
const EXPORT_QUOTA_MAX = 20;
const EXPORT_QUOTA_WINDOW_MS = 60 * 60_000;
export function checkExportQuota(userId: number): RateLimitResult {
  return checkSlidingRate(`export|user|${userId}`, EXPORT_QUOTA_MAX, EXPORT_QUOTA_WINDOW_MS);
}

/**
 * How many export slots the user has remaining in the current hourly window.
 * Pure read — does not record anything. Used by bulk export endpoints to
 * decide whether to reject up-front before consuming any slots, since a bulk
 * export of N campaigns must atomically consume N slots.
 */
export function peekExportQuotaSlots(userId: number): {
  remaining: number;
  retryAfterSec: number;
} {
  const key = `export|user|${userId}`;
  const now = Date.now();
  const cutoff = now - EXPORT_QUOTA_WINDOW_MS;
  const b = slidingBuckets.get(key);
  if (!b) return { remaining: EXPORT_QUOTA_MAX, retryAfterSec: 0 };
  while (b.timestamps.length > 0 && b.timestamps[0] < cutoff) {
    b.timestamps.shift();
  }
  const used = b.timestamps.length;
  const remaining = Math.max(0, EXPORT_QUOTA_MAX - used);
  const retryAfterSec =
    used >= EXPORT_QUOTA_MAX
      ? Math.max(1, Math.ceil((b.timestamps[0] + EXPORT_QUOTA_WINDOW_MS - now) / 1000))
      : 0;
  return { remaining, retryAfterSec };
}

/**
 * Record N consumed export slots in one shot. Used by bulk export endpoints.
 * Per-call `checkExportQuota` only records one timestamp; bulk callers must
 * record N so a 5-campaign bulk download counts as 5 against the quota.
 */
/**
 * Test-only: clears every recorded quota timestamp for a user. Production
 * code never calls this — it's exported so the HTTP integration tests can
 * deterministically reset the per-user export bucket between assertions
 * without waiting an hour for the sliding window to drain.
 */
export function __resetExportQuotaForTests(userId: number): void {
  slidingBuckets.delete(`export|user|${userId}`);
}

export function recordExportQuota(userId: number, n: number): void {
  if (n <= 0) return;
  const key = `export|user|${userId}`;
  const now = Date.now();
  const b = slidingBuckets.get(key);
  if (!b) {
    slidingBuckets.set(key, {
      timestamps: Array.from({ length: n }, () => now),
      windowMs: EXPORT_QUOTA_WINDOW_MS,
    });
    return;
  }
  for (let i = 0; i < n; i++) b.timestamps.push(now);
}

// Forgot-password (self-service): 5 requests / 15 minutes / IP.
// The endpoint is intentionally enumeration-safe (always returns the same 200
// regardless of whether the email exists), so the only thing this throttle
// defends against is mailbomb / DoS amplification — an attacker submitting
// thousands of emails to spam victims' inboxes or burn our Resend quota.
export function checkForgotPasswordPerIp(ip: string): RateLimitResult {
  return checkSlidingRate(`forgot|ip|${ip}`, 5, 15 * 60_000);
}

// Periodic cleanup. Each bucket carries its own windowMs so we never prune
// a timestamp that is still within its caller's intended window.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of slidingBuckets) {
    const cutoff = now - b.windowMs;
    while (b.timestamps.length && b.timestamps[0] < cutoff) b.timestamps.shift();
    if (b.timestamps.length === 0) slidingBuckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && now - b.firstAt > DEFAULT_WINDOW_MS) {
      buckets.delete(k);
    }
  }
}, 60 * 1000).unref?.();
