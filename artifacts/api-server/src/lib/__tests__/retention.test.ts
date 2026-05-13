import { describe, it, expect } from "vitest";
import { computeNextRun, computeScheduledCutoff } from "../retention";

describe("computeNextRun", () => {
  it("returns null when the schedule is disabled", () => {
    expect(
      computeNextRun(new Date("2026-05-13T12:00:00Z"), {
        enabled: false,
        cadence: "daily",
        hour: 3,
        minute: 30,
        dayOfWeek: null,
        dayOfMonth: null,
        olderThanDays: 365,
        dryRunOnly: true,
      }),
    ).toBeNull();
  });

  it("daily: rolls forward when today's slot has already passed", () => {
    const next = computeNextRun(new Date("2026-05-13T12:00:00Z"), {
      enabled: true,
      cadence: "daily",
      hour: 3,
      minute: 30,
      dayOfWeek: null,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-05-14T03:30:00.000Z");
  });

  it("daily: returns today's slot when it is still in the future", () => {
    const next = computeNextRun(new Date("2026-05-13T01:00:00Z"), {
      enabled: true,
      cadence: "daily",
      hour: 3,
      minute: 30,
      dayOfWeek: null,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-05-13T03:30:00.000Z");
  });

  it("weekly: returns null when dayOfWeek is missing", () => {
    expect(
      computeNextRun(new Date("2026-05-13T12:00:00Z"), {
        enabled: true,
        cadence: "weekly",
        hour: 3,
        minute: 0,
        dayOfWeek: null,
        dayOfMonth: null,
        olderThanDays: 365,
        dryRunOnly: true,
      }),
    ).toBeNull();
  });

  it("weekly: walks to the requested day-of-week", () => {
    // 2026-05-13 is a Wednesday (UTC). Schedule for Sunday (0).
    const next = computeNextRun(new Date("2026-05-13T12:00:00Z"), {
      enabled: true,
      cadence: "weekly",
      hour: 4,
      minute: 0,
      dayOfWeek: 0,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-05-17T04:00:00.000Z");
    expect(next?.getUTCDay()).toBe(0);
  });

  it("weekly: rolls to next week when today's matching slot already passed", () => {
    // 2026-05-13 is a Wednesday. Schedule for Wednesday at 03:00 — already past.
    const next = computeNextRun(new Date("2026-05-13T12:00:00Z"), {
      enabled: true,
      cadence: "weekly",
      hour: 3,
      minute: 0,
      dayOfWeek: 3,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-05-20T03:00:00.000Z");
  });

  it("monthly: returns this month when the slot is still in the future", () => {
    const next = computeNextRun(new Date("2026-05-13T12:00:00Z"), {
      enabled: true,
      cadence: "monthly",
      hour: 4,
      minute: 0,
      dayOfWeek: null,
      dayOfMonth: 20,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-05-20T04:00:00.000Z");
  });

  it("monthly: rolls to next month when this month's slot has passed", () => {
    const next = computeNextRun(new Date("2026-05-13T12:00:00Z"), {
      enabled: true,
      cadence: "monthly",
      hour: 4,
      minute: 0,
      dayOfWeek: null,
      dayOfMonth: 5,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-06-05T04:00:00.000Z");
  });

  it("monthly: dayOfMonth>28 is clamped to 28 so February is always valid", () => {
    // Pick a February to prove the clamp prevents invalid dates / month skip.
    const next = computeNextRun(new Date("2026-02-01T00:00:00Z"), {
      enabled: true,
      cadence: "monthly",
      hour: 6,
      minute: 0,
      dayOfWeek: null,
      dayOfMonth: 31,
      olderThanDays: 365,
      dryRunOnly: true,
    });
    expect(next?.toISOString()).toBe("2026-02-28T06:00:00.000Z");
  });
});

describe("first-run baseline", () => {
  // Regression: anchoring the "after" baseline at the epoch makes every past
  // cadence slot look overdue and fires the schedule immediately on first
  // enable. The scheduler must baseline on `now` when lastRunAt is null so
  // the first run lands at the next real cadence slot.
  it("baselining off `now` yields a strictly future next-run for daily", () => {
    const now = new Date("2026-05-13T12:00:00Z");
    const next = computeNextRun(now, {
      enabled: true,
      cadence: "daily",
      hour: 3,
      minute: 30,
      dayOfWeek: null,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: false,
    });
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("anchoring at the epoch (the bug) would treat the slot as overdue", () => {
    const now = new Date("2026-05-13T12:00:00Z");
    const buggyNext = computeNextRun(new Date(0), {
      enabled: true,
      cadence: "daily",
      hour: 3,
      minute: 30,
      dayOfWeek: null,
      dayOfMonth: null,
      olderThanDays: 365,
      dryRunOnly: false,
    });
    // Demonstrates why the tick must NOT use epoch as the baseline:
    // computeNextRun would return a fire-time decades earlier than `now`.
    expect(buggyNext!.getTime()).toBeLessThan(now.getTime());
  });
});

describe("computeScheduledCutoff", () => {
  it("subtracts the retention window in UTC days", () => {
    expect(
      computeScheduledCutoff(new Date("2026-05-13T12:00:00Z"), 30),
    ).toBe("2026-04-13");
  });

  it("crosses month boundaries cleanly", () => {
    expect(
      computeScheduledCutoff(new Date("2026-03-05T00:00:00Z"), 10),
    ).toBe("2026-02-23");
  });
});
