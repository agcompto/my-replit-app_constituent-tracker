import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { requireRole } from "../lib/auth";
import { requireRecentAuth } from "../lib/recentAuth";
import {
  computeNextRun,
  executeScheduledRun,
  type RetentionCadence,
  type ScheduleConfig,
  tryAcquireRetentionLock,
} from "../lib/retention";

const router: IRouter = Router();

interface SchedulePatch {
  enabled?: boolean;
  cadence?: "daily" | "weekly" | "monthly";
  hour?: number;
  minute?: number;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  olderThanDays?: number;
  dryRunOnly?: boolean;
}

function parseSchedulePatch(
  body: unknown,
): { ok: true; value: SchedulePatch } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const out: SchedulePatch = {};
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") return { ok: false, error: "enabled must be boolean" };
    out.enabled = b.enabled;
  }
  if (b.cadence !== undefined) {
    if (b.cadence !== "daily" && b.cadence !== "weekly" && b.cadence !== "monthly") {
      return { ok: false, error: "cadence must be daily | weekly | monthly" };
    }
    out.cadence = b.cadence;
  }
  if (b.hour !== undefined) {
    if (!Number.isInteger(b.hour) || (b.hour as number) < 0 || (b.hour as number) > 23) {
      return { ok: false, error: "hour must be an integer in 0..23" };
    }
    out.hour = b.hour as number;
  }
  if (b.minute !== undefined) {
    if (!Number.isInteger(b.minute) || (b.minute as number) < 0 || (b.minute as number) > 59) {
      return { ok: false, error: "minute must be an integer in 0..59" };
    }
    out.minute = b.minute as number;
  }
  if (b.dayOfWeek !== undefined) {
    if (b.dayOfWeek === null) out.dayOfWeek = null;
    else if (!Number.isInteger(b.dayOfWeek) || (b.dayOfWeek as number) < 0 || (b.dayOfWeek as number) > 6) {
      return { ok: false, error: "dayOfWeek must be 0..6 or null" };
    } else out.dayOfWeek = b.dayOfWeek as number;
  }
  if (b.dayOfMonth !== undefined) {
    if (b.dayOfMonth === null) out.dayOfMonth = null;
    else if (!Number.isInteger(b.dayOfMonth) || (b.dayOfMonth as number) < 1 || (b.dayOfMonth as number) > 31) {
      return { ok: false, error: "dayOfMonth must be 1..31 or null" };
    } else out.dayOfMonth = b.dayOfMonth as number;
  }
  if (b.olderThanDays !== undefined) {
    if (!Number.isInteger(b.olderThanDays) || (b.olderThanDays as number) < 1 || (b.olderThanDays as number) > 36500) {
      return { ok: false, error: "olderThanDays must be 1..36500" };
    }
    out.olderThanDays = b.olderThanDays as number;
  }
  if (b.dryRunOnly !== undefined) {
    if (typeof b.dryRunOnly !== "boolean") return { ok: false, error: "dryRunOnly must be boolean" };
    out.dryRunOnly = b.dryRunOnly;
  }
  return { ok: true, value: out };
}

function parseRunNow(
  body: unknown,
): { ok: true; value: { dryRun?: boolean } } | { ok: false; error: string } {
  if (body === undefined || body === null) return { ok: true, value: {} };
  if (typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  if (b.dryRun !== undefined && typeof b.dryRun !== "boolean") {
    return { ok: false, error: "dryRun must be boolean" };
  }
  return { ok: true, value: { dryRun: b.dryRun as boolean | undefined } };
}

function toScheduleResponse(s: typeof appSettingsTable.$inferSelect) {
  const cfg: ScheduleConfig = {
    enabled: s.retentionScheduleEnabled,
    cadence: s.retentionScheduleCadence as RetentionCadence,
    hour: s.retentionScheduleHour,
    minute: s.retentionScheduleMinute,
    dayOfWeek: s.retentionScheduleDayOfWeek,
    dayOfMonth: s.retentionScheduleDayOfMonth,
    olderThanDays: s.retentionScheduleOlderThanDays,
    dryRunOnly: s.retentionScheduleDryRunOnly,
  };
  // Next run computed relative to either the last run (so the schedule
  // doesn't immediately re-fire after a recent run) or now (on first boot).
  const after = s.retentionScheduleLastRunAt ?? new Date();
  const nextRunAt = cfg.enabled ? computeNextRun(after, cfg) : null;
  return {
    enabled: cfg.enabled,
    cadence: cfg.cadence,
    hour: cfg.hour,
    minute: cfg.minute,
    dayOfWeek: cfg.dayOfWeek,
    dayOfMonth: cfg.dayOfMonth,
    olderThanDays: cfg.olderThanDays,
    dryRunOnly: cfg.dryRunOnly,
    lastRunAt: s.retentionScheduleLastRunAt
      ? s.retentionScheduleLastRunAt.toISOString()
      : null,
    lastRunResult: s.retentionScheduleLastRunResult ?? null,
    nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
  };
}

async function loadSettings() {
  const [s] = await db.select().from(appSettingsTable).limit(1);
  if (!s) {
    const [created] = await db.insert(appSettingsTable).values({ id: 1 }).returning();
    return created;
  }
  return s;
}

router.get(
  "/retention/schedule",
  requireRole("super_admin"),
  async (_req, res): Promise<void> => {
    const s = await loadSettings();
    res.json(toScheduleResponse(s));
  },
);

router.patch(
  "/retention/schedule",
  requireRole("super_admin"),
  requireRecentAuth,
  async (req, res): Promise<void> => {
    const parsed = parseSchedulePatch(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const s = await loadSettings();

    // Validate the *resulting* schedule shape. We have to know the cadence
    // we'll end up with to know whether dayOfWeek / dayOfMonth are required.
    const finalCadence = (parsed.value.cadence ?? s.retentionScheduleCadence) as
      | "daily"
      | "weekly"
      | "monthly";
    const finalDow =
      parsed.value.dayOfWeek !== undefined
        ? parsed.value.dayOfWeek
        : s.retentionScheduleDayOfWeek;
    const finalDom =
      parsed.value.dayOfMonth !== undefined
        ? parsed.value.dayOfMonth
        : s.retentionScheduleDayOfMonth;
    const finalEnabled = parsed.value.enabled ?? s.retentionScheduleEnabled;
    if (finalEnabled) {
      if (finalCadence === "weekly" && (finalDow === null || finalDow === undefined)) {
        res.status(400).json({ error: "dayOfWeek is required when cadence is weekly" });
        return;
      }
      if (finalCadence === "monthly" && (finalDom === null || finalDom === undefined)) {
        res.status(400).json({ error: "dayOfMonth is required when cadence is monthly" });
        return;
      }
    }

    const updateValues: Partial<typeof appSettingsTable.$inferInsert> = {};
    if (parsed.value.enabled !== undefined)
      updateValues.retentionScheduleEnabled = parsed.value.enabled;
    if (parsed.value.cadence !== undefined)
      updateValues.retentionScheduleCadence = parsed.value.cadence;
    if (parsed.value.hour !== undefined)
      updateValues.retentionScheduleHour = parsed.value.hour;
    if (parsed.value.minute !== undefined)
      updateValues.retentionScheduleMinute = parsed.value.minute;
    if (parsed.value.dayOfWeek !== undefined)
      updateValues.retentionScheduleDayOfWeek = parsed.value.dayOfWeek;
    if (parsed.value.dayOfMonth !== undefined)
      updateValues.retentionScheduleDayOfMonth = parsed.value.dayOfMonth;
    if (parsed.value.olderThanDays !== undefined)
      updateValues.retentionScheduleOlderThanDays = parsed.value.olderThanDays;
    if (parsed.value.dryRunOnly !== undefined)
      updateValues.retentionScheduleDryRunOnly = parsed.value.dryRunOnly;

    // Anchor `lastRunAt` to `now` whenever the schedule is being newly
    // enabled (disabled→enabled, or enabled-without-an-anchor). The tick
    // computes "due?" as `computeNextRun(lastRunAt, cfg) <= now`, so a
    // stable anchor in the past is required for the next cadence slot to
    // ever be reached. Without this, the tick's per-call baseline keeps
    // moving forward and the schedule never fires on its own.
    const willBeEnabled =
      parsed.value.enabled !== undefined
        ? parsed.value.enabled
        : s.retentionScheduleEnabled;
    const wasEnabled = s.retentionScheduleEnabled;
    if (willBeEnabled && (!wasEnabled || s.retentionScheduleLastRunAt === null)) {
      updateValues.retentionScheduleLastRunAt = new Date();
    }

    const [updated] = await db
      .update(appSettingsTable)
      .set(updateValues)
      .where(eq(appSettingsTable.id, s.id))
      .returning();
    res.json(toScheduleResponse(updated));
  },
);

router.post(
  "/retention/schedule/run-now",
  requireRole("super_admin"),
  async (req, res): Promise<void> => {
    const parsed = parseRunNow(req.body ?? {});
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    // If the run will actually delete (not dry-run), require recent auth.
    // We mirror the schedule's `dryRunOnly` setting unless the request
    // explicitly overrides to a stricter dry-run.
    const s = await loadSettings();
    const willActuallyDelete =
      parsed.value.dryRun === false ||
      (parsed.value.dryRun === undefined && !s.retentionScheduleDryRunOnly);
    if (willActuallyDelete) {
      const last = req.session?.lastAuthAt;
      if (!last || Date.now() - last > 5 * 60 * 1000) {
        res.status(403).json({
          error: "Please re-enter your password to confirm this action.",
          code: "reauth_required",
        });
        return;
      }
    }

    // Acquire the same advisory lock as the scheduler so a manual "run now"
    // can't double-execute alongside a tick that's already in flight.
    const release = await tryAcquireRetentionLock();
    if (!release) {
      res.status(409).json({
        error: "A retention run is already in progress; try again shortly.",
        code: "retention_busy",
      });
      return;
    }
    try {
      // Per-request dry-run override is passed as a parameter so we never
      // mutate the persisted schedule — an exception during the run can't
      // leave the org's dryRunOnly flag flipped.
      const result = await executeScheduledRun({
        actor: req.currentUser!,
        source: "manual",
        dryRunOverride: parsed.value.dryRun,
      });
      const fresh = await loadSettings();
      res.json({ result, schedule: toScheduleResponse(fresh) });
    } finally {
      await release();
    }
  },
);

export default router;
