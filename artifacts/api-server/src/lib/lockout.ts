import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export const LOCKOUT_THRESHOLD = 10;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutState {
  locked: boolean;
  lockedUntil?: Date;
  retryAfterSec: number;
}

/** Returns the current lockout state for a user record by id. */
export async function getLockoutState(userId: number): Promise<LockoutState> {
  const [u] = await db
    .select({ lockedUntil: usersTable.lockedUntil })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u?.lockedUntil) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  const until = u.lockedUntil.getTime();
  if (until <= now) return { locked: false, retryAfterSec: 0 };
  return {
    locked: true,
    lockedUntil: u.lockedUntil,
    retryAfterSec: Math.ceil((until - now) / 1000),
  };
}

/**
 * Record a failed login. If the new attempt count crosses the threshold, the
 * user is locked for `LOCKOUT_DURATION_MS`. Returns the resulting state.
 */
export async function recordLoginFailureForUser(userId: number): Promise<LockoutState> {
  const lockUntilCandidate = new Date(Date.now() + LOCKOUT_DURATION_MS);
  const [u] = await db
    .update(usersTable)
    .set({
      failedLoginAttempts: sql`${usersTable.failedLoginAttempts} + 1`,
      lockedUntil: sql`CASE WHEN ${usersTable.failedLoginAttempts} + 1 >= ${LOCKOUT_THRESHOLD} THEN ${lockUntilCandidate} ELSE ${usersTable.lockedUntil} END`,
    })
    .where(eq(usersTable.id, userId))
    .returning({
      attempts: usersTable.failedLoginAttempts,
      lockedUntil: usersTable.lockedUntil,
    });
  if (!u?.lockedUntil) return { locked: false, retryAfterSec: 0 };
  const now = Date.now();
  const until = u.lockedUntil.getTime();
  if (until <= now) return { locked: false, retryAfterSec: 0 };
  return {
    locked: true,
    lockedUntil: u.lockedUntil,
    retryAfterSec: Math.ceil((until - now) / 1000),
  };
}

/** Clear failure counter on a successful authentication. */
export async function clearLoginFailures(userId: number): Promise<void> {
  await db
    .update(usersTable)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(usersTable.id, userId));
}
