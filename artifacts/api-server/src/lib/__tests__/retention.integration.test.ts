/**
 * Integration test for `tryAcquireRetentionLock`. Verifies that the Postgres
 * advisory lock truly serializes scheduled retention runs across connections,
 * which is what protects the autoscale deployment from double-execution.
 *
 * Skipped when DATABASE_URL is unset so the unit suite still runs offline.
 */
import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, closeDb, appSettingsTable, auditLogTable } from "@workspace/db";
import {
  retentionSchedulerTick,
  tryAcquireRetentionLock,
} from "../retention";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

if (HAS_DB) {
  afterAll(async () => {
    await closeDb();
  });
}

d("tryAcquireRetentionLock", () => {
  it("returns null on a second attempt while the first holder still owns the lock", async () => {
    const release1 = await tryAcquireRetentionLock();
    expect(release1).not.toBeNull();
    try {
      // A second concurrent acquirer must be blocked, not queued — so we get
      // back null synchronously instead of waiting for release1.
      const release2 = await tryAcquireRetentionLock();
      expect(release2).toBeNull();
    } finally {
      await release1?.();
    }
  });

  it("becomes acquirable again after release", async () => {
    const release1 = await tryAcquireRetentionLock();
    expect(release1).not.toBeNull();
    await release1?.();
    const release2 = await tryAcquireRetentionLock();
    expect(release2).not.toBeNull();
    await release2?.();
  });
});

d("retentionSchedulerTick", () => {
  beforeEach(async () => {
    // Reset schedule to a known disabled baseline. Don't blow away other
    // settings — the row is shared with the rest of the app.
    await db
      .update(appSettingsTable)
      .set({
        retentionScheduleEnabled: false,
        retentionScheduleLastRunAt: null,
        retentionScheduleLastRunResult: null,
      })
      .where(eq(appSettingsTable.id, 1));
  });

  it("does NOT execute on first tick when lastRunAt is null — it anchors and waits", async () => {
    // Simulate a half-configured DB row: enabled=true but no anchor.
    // The tick must be defensive and write `lastRunAt = now` instead of
    // executing the run, so the cadence drift bug can't fire deletes
    // immediately on a freshly-enabled schedule.
    await db
      .update(appSettingsTable)
      .set({
        retentionScheduleEnabled: true,
        retentionScheduleCadence: "daily",
        retentionScheduleHour: 3,
        retentionScheduleMinute: 30,
        retentionScheduleDryRunOnly: true,
        retentionScheduleOlderThanDays: 365,
        retentionScheduleLastRunAt: null,
        retentionScheduleLastRunResult: null,
      })
      .where(eq(appSettingsTable.id, 1));

    const before = Date.now();
    await retentionSchedulerTick(new Date());
    const [after] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.id, 1))
      .limit(1);
    expect(after?.retentionScheduleLastRunAt).not.toBeNull();
    expect(after?.retentionScheduleLastRunAt!.getTime()).toBeGreaterThanOrEqual(before);
    // Crucially: no run was executed, so no result row was written.
    expect(after?.retentionScheduleLastRunResult).toBeNull();
  });

  it("executes when the computed next-run is in the past, then anchors lastRunAt", async () => {
    // Anchor far enough in the past that the next daily slot is already due.
    const longAgo = new Date(Date.now() - 1000 * 60 * 60 * 48); // 48h ago
    await db
      .update(appSettingsTable)
      .set({
        retentionScheduleEnabled: true,
        retentionScheduleCadence: "daily",
        retentionScheduleHour: 0,
        retentionScheduleMinute: 0,
        retentionScheduleDryRunOnly: true,
        retentionScheduleOlderThanDays: 365,
        retentionScheduleLastRunAt: longAgo,
        retentionScheduleLastRunResult: null,
        // Master kill-switch may be off in this DB; the tick still records
        // a run, just with `skipped: retention_delete_disabled`.
      })
      .where(eq(appSettingsTable.id, 1));

    await retentionSchedulerTick(new Date());

    const [after] = await db
      .select()
      .from(appSettingsTable)
      .where(eq(appSettingsTable.id, 1))
      .limit(1);
    expect(after?.retentionScheduleLastRunResult).not.toBeNull();
    expect(after?.retentionScheduleLastRunAt!.getTime()).toBeGreaterThan(
      longAgo.getTime(),
    );

    // Audit row written for the scheduled run.
    const rows = await db
      .select()
      .from(auditLogTable)
      .where(eq(auditLogTable.action, "retention_scheduled_run"))
      .limit(5);
    expect(rows.length).toBeGreaterThan(0);
  });
});
