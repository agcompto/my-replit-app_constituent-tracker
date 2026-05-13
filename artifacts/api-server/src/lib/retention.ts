import { eq, sql } from "drizzle-orm";
import {
  db,
  pool,
  appSettingsTable,
  auditLogTable,
  campaignsTable,
  touchpointsTable,
} from "@workspace/db";
import { audit, type SessionUser } from "./auth";
import { logger } from "./logger";

/** Postgres advisory-lock key used to serialize scheduled retention runs
 *  across multiple Node instances (e.g. Replit autoscale). Two int4 keys
 *  are passed to `pg_try_advisory_lock(int4, int4)` so the value space is
 *  well-defined and stable across releases.
 *  Pick something distinctive so it can't collide with another feature. */
export const RETENTION_LOCK_NAMESPACE = 0x52_45_54_4e; // "RETN"
export const RETENTION_LOCK_KEY = 0x53_43_48_44; // "SCHD"

export type RetentionCadence = "daily" | "weekly" | "monthly";

export interface RetentionRunInput {
  /** Inclusive upper bound — records strictly older than this date are
   *  candidates. Always a YYYY-MM-DD string. */
  olderThan: string;
  dryRun: boolean;
}

export interface RetentionRunResult {
  runAt: string;
  olderThan: string;
  dryRun: boolean;
  campaignsDeleted: number;
  touchpointsDeleted: number;
  /** Set when the run short-circuited (e.g. retentionDeleteEnabled is off). */
  skipped?: string;
  error?: string;
}

/** Count how many rows the given retention cutoff would affect. Used by both
 *  the dry-run path and the live-delete path so the audit/result rows
 *  consistently report what was (or would have been) removed. */
async function countRetentionTargets(olderThan: string): Promise<{
  campaigns: number;
  touchpoints: number;
}> {
  const [counts] = await db
    .select({
      campaigns: sql<number>`(select count(*)::int from ${campaignsTable} where created_at < ${olderThan}::date)`,
      touchpoints: sql<number>`(select count(*)::int from ${touchpointsTable} where send_date < ${olderThan}::date)`,
    })
    .from(sql`(select 1) t`);
  return {
    campaigns: counts?.campaigns ?? 0,
    touchpoints: counts?.touchpoints ?? 0,
  };
}

/** Core retention pipeline used by both the manual `POST /retention/delete`
 *  path and the scheduled runner. Always counts first so the result is
 *  meaningful in both dry-run and live-delete mode. */
export async function runRetentionPipeline(
  input: RetentionRunInput,
): Promise<RetentionRunResult> {
  const counts = await countRetentionTargets(input.olderThan);
  if (!input.dryRun) {
    await db.execute(
      sql`delete from ${campaignsTable} where created_at < ${input.olderThan}::date`,
    );
  }
  return {
    runAt: new Date().toISOString(),
    olderThan: input.olderThan,
    dryRun: input.dryRun,
    campaignsDeleted: counts.campaigns,
    touchpointsDeleted: counts.touchpoints,
  };
}

/** Compute the YYYY-MM-DD `olderThan` cutoff for a schedule that retains
 *  records for `retainDays` days. The cutoff is exclusive (records strictly
 *  older than it are deleted). UTC for determinism. */
export function computeScheduledCutoff(now: Date, retainDays: number): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() - retainDays);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ScheduleConfig {
  enabled: boolean;
  cadence: RetentionCadence;
  hour: number;
  minute: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  olderThanDays: number;
  dryRunOnly: boolean;
}

/** Compute the next scheduled fire time strictly after `after`. All time
 *  math is in UTC so the result is a stable absolute instant regardless of
 *  the host's local timezone. Returns `null` if the schedule is misconfigured
 *  (e.g. weekly cadence with no day-of-week). */
export function computeNextRun(after: Date, cfg: ScheduleConfig): Date | null {
  if (!cfg.enabled) return null;
  const hour = cfg.hour;
  const minute = cfg.minute;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (cfg.cadence === "daily") {
    const candidate = new Date(
      Date.UTC(
        after.getUTCFullYear(),
        after.getUTCMonth(),
        after.getUTCDate(),
        hour,
        minute,
        0,
        0,
      ),
    );
    if (candidate.getTime() <= after.getTime()) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  if (cfg.cadence === "weekly") {
    const dow = cfg.dayOfWeek;
    if (dow === null || dow < 0 || dow > 6) return null;
    // Start from today at HH:MM, then walk forward day by day until we hit
    // the right day-of-week strictly after `after`.
    const candidate = new Date(
      Date.UTC(
        after.getUTCFullYear(),
        after.getUTCMonth(),
        after.getUTCDate(),
        hour,
        minute,
        0,
        0,
      ),
    );
    for (let i = 0; i < 8; i++) {
      if (
        candidate.getUTCDay() === dow &&
        candidate.getTime() > after.getTime()
      ) {
        return candidate;
      }
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return null;
  }

  if (cfg.cadence === "monthly") {
    const dom = cfg.dayOfMonth;
    if (dom === null || dom < 1 || dom > 31) return null;
    // Clamp DOM to 28 to keep every month valid (avoids "Feb 30" gaps).
    const safeDom = Math.min(dom, 28);
    const tryMonth = (year: number, month: number) =>
      new Date(Date.UTC(year, month, safeDom, hour, minute, 0, 0));
    let candidate = tryMonth(after.getUTCFullYear(), after.getUTCMonth());
    if (candidate.getTime() <= after.getTime()) {
      candidate = tryMonth(after.getUTCFullYear(), after.getUTCMonth() + 1);
    }
    return candidate;
  }

  return null;
}

/** Synthetic actor for system-initiated audit rows. */
export const SCHEDULER_ACTOR: SessionUser = {
  id: 0,
  email: "scheduler@system.local",
  name: "Retention Scheduler",
  role: "super_admin",
  active: true,
  piiAcknowledged: true,
  mustChangePassword: false,
  totpEnrolled: false,
  totpRequired: false,
};

interface RunOnceArgs {
  /** Synthetic or real actor used in audit rows. */
  actor: SessionUser;
  /** Source label written into audit details so manual vs scheduled runs are
   *  distinguishable. */
  source: "manual" | "scheduled";
  /** Optional per-call override for dry-run. When undefined, the schedule's
   *  persisted `dryRunOnly` flag is honored. Lets the run-now endpoint pass
   *  an effective dry-run without mutating the persisted schedule. */
  dryRunOverride?: boolean;
}

/** Execute a single retention run end-to-end, updating the schedule's
 *  bookkeeping columns and writing audit entries. Returns the result so the
 *  caller can surface it (HTTP response or scheduler log). */
export async function executeScheduledRun(
  args: RunOnceArgs,
): Promise<RetentionRunResult> {
  const [settings] = await db.select().from(appSettingsTable).limit(1);
  if (!settings) {
    return {
      runAt: new Date().toISOString(),
      olderThan: "",
      dryRun: true,
      campaignsDeleted: 0,
      touchpointsDeleted: 0,
      skipped: "settings_missing",
    };
  }
  const cfg: ScheduleConfig = {
    enabled: settings.retentionScheduleEnabled,
    cadence: settings.retentionScheduleCadence as RetentionCadence,
    hour: settings.retentionScheduleHour,
    minute: settings.retentionScheduleMinute,
    dayOfWeek: settings.retentionScheduleDayOfWeek,
    dayOfMonth: settings.retentionScheduleDayOfMonth,
    olderThanDays: settings.retentionScheduleOlderThanDays,
    dryRunOnly: settings.retentionScheduleDryRunOnly,
  };
  const olderThan = computeScheduledCutoff(new Date(), cfg.olderThanDays);
  const effectiveDryRun =
    args.dryRunOverride !== undefined ? args.dryRunOverride : cfg.dryRunOnly;

  let result: RetentionRunResult;
  if (!settings.retentionDeleteEnabled) {
    // The org has the master kill switch off — record a skipped run so the
    // operator can see the schedule is firing but no-oping.
    result = {
      runAt: new Date().toISOString(),
      olderThan,
      dryRun: true,
      campaignsDeleted: 0,
      touchpointsDeleted: 0,
      skipped: "retention_delete_disabled",
    };
  } else {
    try {
      result = await runRetentionPipeline({
        olderThan,
        dryRun: effectiveDryRun,
      });
    } catch (err) {
      result = {
        runAt: new Date().toISOString(),
        olderThan,
        dryRun: effectiveDryRun,
        campaignsDeleted: 0,
        touchpointsDeleted: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error({ err }, "Retention run failed");
    }
  }

  await db
    .update(appSettingsTable)
    .set({
      retentionScheduleLastRunAt: new Date(result.runAt),
      retentionScheduleLastRunResult: result,
    })
    .where(eq(appSettingsTable.id, settings.id));

  // Audit policy: every run — manual or scheduled — emits a `retention_delete`
  // row so existing tooling that watches that action keeps seeing every
  // deletion event. Scheduled runs additionally emit a `retention_scheduled_run`
  // row tagged with the schedule config so an operator can audit the cadence
  // path on its own. Skipped runs (kill switch off) and dry-runs are still
  // audited — the action is the same, the `dryRun` / `skipped` fields tell
  // the reader what actually happened.
  const detailsBase = {
    source: args.source,
    cadence: cfg.cadence,
    olderThan: result.olderThan,
    dryRun: result.dryRun,
    skipped: result.skipped ?? null,
    campaignsDeleted: result.campaignsDeleted,
    touchpointsDeleted: result.touchpointsDeleted,
    error: result.error ?? null,
  };
  const writeAuditRow = async (
    action: "retention_delete" | "retention_scheduled_run",
    extraDetails?: Record<string, unknown>,
  ) => {
    const details = JSON.stringify({ ...detailsBase, ...(extraDetails ?? {}) });
    if (args.source === "scheduled" && args.actor.id === 0) {
      // System-initiated row: actor_user_id is NULL (no FK target). Write the
      // audit row directly so the FK constraint on the helper isn't tripped.
      await db.insert(auditLogTable).values({
        actorUserId: null,
        actorName: args.actor.name,
        actorRole: args.actor.role,
        action,
        entityType: "system",
        entityId: null,
        details,
      });
    } else {
      await audit({
        actor: args.actor,
        action,
        entityType: "system",
        details,
      });
    }
  };
  await writeAuditRow("retention_delete");
  if (args.source === "scheduled") {
    await writeAuditRow("retention_scheduled_run", {
      schedule: {
        cadence: cfg.cadence,
        hour: cfg.hour,
        minute: cfg.minute,
        dayOfWeek: cfg.dayOfWeek,
        dayOfMonth: cfg.dayOfMonth,
        olderThanDays: cfg.olderThanDays,
        dryRunOnly: cfg.dryRunOnly,
      },
    });
  }

  return result;
}

/** Try to acquire the cross-process retention advisory lock. Returns
 *  `release` when the lock was obtained, or `null` when another instance
 *  already holds it. The caller MUST `await release()` in a finally block. */
export async function tryAcquireRetentionLock(): Promise<
  null | (() => Promise<void>)
> {
  // Use a dedicated client so the lock is bound to a single connection (a
  // pooled query has no stable session affinity).
  const client = await pool.connect();
  try {
    const r = await client.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS ok",
      [RETENTION_LOCK_NAMESPACE, RETENTION_LOCK_KEY],
    );
    if (!r.rows[0]?.ok) {
      client.release();
      return null;
    }
    return async () => {
      try {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [
          RETENTION_LOCK_NAMESPACE,
          RETENTION_LOCK_KEY,
        ]);
      } finally {
        client.release();
      }
    };
  } catch (err) {
    client.release();
    throw err;
  }
}

/** Background tick that the in-process scheduler invokes once per minute.
 *  Runs at most one retention pass per tick across the entire deployment by
 *  gating on a Postgres advisory lock. Holds the lock for the duration of
 *  the run so concurrent instances cannot double-execute. */
export async function retentionSchedulerTick(now: Date = new Date()): Promise<void> {
  const [settings] = await db.select().from(appSettingsTable).limit(1);
  if (!settings || !settings.retentionScheduleEnabled) return;
  const cfg: ScheduleConfig = {
    enabled: settings.retentionScheduleEnabled,
    cadence: settings.retentionScheduleCadence as RetentionCadence,
    hour: settings.retentionScheduleHour,
    minute: settings.retentionScheduleMinute,
    dayOfWeek: settings.retentionScheduleDayOfWeek,
    dayOfMonth: settings.retentionScheduleDayOfMonth,
    olderThanDays: settings.retentionScheduleOlderThanDays,
    dryRunOnly: settings.retentionScheduleDryRunOnly,
  };
  // The tick computes "due?" as `computeNextRun(lastRunAt, cfg) <= now`.
  // That means we need a STABLE anchor in the past — not `now`, which
  // moves with every tick and prevents the strictly-after next slot from
  // ever being reached.
  // The PATCH route normally sets `lastRunAt = now` when enabling the
  // schedule, but if we somehow see an enabled schedule with a null
  // anchor (legacy row, manual DB edit) we anchor it here defensively
  // and skip this tick — the next tick will compare against this anchor.
  if (settings.retentionScheduleLastRunAt === null) {
    await db
      .update(appSettingsTable)
      .set({ retentionScheduleLastRunAt: now })
      .where(eq(appSettingsTable.id, settings.id));
    return;
  }
  const after = settings.retentionScheduleLastRunAt;
  const next = computeNextRun(after, cfg);
  if (!next || next.getTime() > now.getTime()) return;

  const release = await tryAcquireRetentionLock();
  if (!release) {
    logger.debug("Retention lock held by another instance; skipping tick");
    return;
  }
  try {
    // Re-check inside the lock to avoid a race where another instance just
    // finished and wrote a fresh `lastRunAt`.
    const [fresh] = await db.select().from(appSettingsTable).limit(1);
    if (!fresh || !fresh.retentionScheduleEnabled) return;
    if (fresh.retentionScheduleLastRunAt === null) return;
    const freshAfter = fresh.retentionScheduleLastRunAt;
    const freshNext = computeNextRun(freshAfter, {
      ...cfg,
      enabled: fresh.retentionScheduleEnabled,
      cadence: fresh.retentionScheduleCadence as RetentionCadence,
      hour: fresh.retentionScheduleHour,
      minute: fresh.retentionScheduleMinute,
      dayOfWeek: fresh.retentionScheduleDayOfWeek,
      dayOfMonth: fresh.retentionScheduleDayOfMonth,
      olderThanDays: fresh.retentionScheduleOlderThanDays,
      dryRunOnly: fresh.retentionScheduleDryRunOnly,
    });
    if (!freshNext || freshNext.getTime() > now.getTime()) return;
    await executeScheduledRun({ actor: SCHEDULER_ACTOR, source: "scheduled" });
  } finally {
    await release();
  }
}

let timer: NodeJS.Timeout | null = null;

/** Start the in-process scheduler. Idempotent. The tick interval is
 *  deliberately conservative (60s) — the schedule has minute-level
 *  resolution so anything finer just wastes wakeups. */
export function startRetentionScheduler(intervalMs = 60_000): void {
  if (timer) return;
  timer = setInterval(() => {
    retentionSchedulerTick().catch((err) => {
      logger.error({ err }, "Retention scheduler tick failed");
    });
  }, intervalMs);
  // Don't keep the event loop alive solely for the scheduler — the HTTP
  // server is the canonical liveness owner.
  timer.unref?.();
}

export function stopRetentionScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
