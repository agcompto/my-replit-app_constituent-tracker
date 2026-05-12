import { describe, it, expect } from "vitest";
import {
  computeThresholdConflicts,
  type PlannedTouch,
  type ThresholdRule,
} from "../threshold";

const touch = (
  id: number,
  sendDate: string,
  overrides: Partial<PlannedTouch> = {},
): PlannedTouch => ({
  id,
  channelId: 1,
  campaignTypeId: 1,
  sendDate,
  channelLabel: "Email",
  campaignTypeLabel: "Annual",
  touchName: `Touch ${id}`,
  audienceMode: "campaign",
  ...overrides,
});

const rule = (
  id: number,
  windowDays: number,
  maxTouchpoints: number,
  overrides: Partial<ThresholdRule> = {},
): ThresholdRule => ({
  id,
  name: `Rule ${id}`,
  scope: "all",
  channelId: null,
  campaignTypeId: null,
  windowDays,
  maxTouchpoints,
  ...overrides,
});

describe("computeThresholdConflicts (DST / rolling-window math)", () => {
  it("flags a 30-day window violation that straddles US spring-forward (2026-03-08)", () => {
    // Five planned touches inside a 30-day window crossing DST.
    // With max=3, two of them must be flagged. If diffDays drifted by even
    // 0.04 days at the DST boundary, the boundary touch on day 30 would be
    // (incorrectly) excluded and the conflict could be missed.
    const planned = [
      touch(1, "2026-02-22"),
      touch(2, "2026-03-01"),
      touch(3, "2026-03-08"), // spring-forward day
      touch(4, "2026-03-15"),
      touch(5, "2026-03-22"),
    ];
    const audience = new Set(["00000001"]);
    const audienceByTouch = new Map<number, Set<string>>(
      planned.map((p) => [p.id, audience]),
    );
    const out = computeThresholdConflicts({
      planned,
      history: [],
      thresholds: [rule(100, 30, 3)],
      overrides: new Set(),
      audienceByTouch,
    });
    expect(out.totalProjectedTouchpoints).toBe(5);
    expect(out.totalFlaggedDonors).toBe(1);
    expect(out.conflicts.length).toBeGreaterThan(0);
    expect(out.conflicts[0]!.donorId).toBe("00000001");
    expect(out.conflicts[0]!.projectedCount).toBe(5);
  });

  it("touch exactly windowDays away is OUTSIDE the window (strict <)", () => {
    // Two touches 30 days apart with windowDays=30 must NOT trigger,
    // because the window is strict-less-than. This pinpoints the boundary
    // condition that DST-induced fractional days could break.
    const planned = [touch(1, "2026-02-22"), touch(2, "2026-03-24")];
    const audience = new Set(["00000001"]);
    const audienceByTouch = new Map<number, Set<string>>(
      planned.map((p) => [p.id, audience]),
    );
    const out = computeThresholdConflicts({
      planned,
      history: [],
      thresholds: [rule(100, 30, 1)],
      overrides: new Set(),
      audienceByTouch,
    });
    expect(out.conflicts).toEqual([]);
    expect(out.totalFlaggedDonors).toBe(0);
  });

  it("touch one day inside the window across DST DOES trigger (max=1)", () => {
    // 29 days apart across spring-forward, window=30, max=1: must flag.
    const planned = [touch(1, "2026-02-22"), touch(2, "2026-03-23")];
    const audience = new Set(["00000001"]);
    const audienceByTouch = new Map<number, Set<string>>(
      planned.map((p) => [p.id, audience]),
    );
    const out = computeThresholdConflicts({
      planned,
      history: [],
      thresholds: [rule(100, 30, 1)],
      overrides: new Set(),
      audienceByTouch,
    });
    expect(out.totalFlaggedDonors).toBe(1);
    expect(out.conflicts[0]!.projectedCount).toBe(2);
  });

  it("history rows across fall-back DST (2026-11-01) combine with planned touches correctly", () => {
    // Historical touch 2026-10-18 + planned 2026-11-16 = 29 days, inside a 30-day window.
    const planned = [touch(1, "2026-11-16")];
    const audience = new Set(["00000001"]);
    const audienceByTouch = new Map<number, Set<string>>([[1, audience]]);
    const out = computeThresholdConflicts({
      planned,
      history: [
        { donorId: "00000001", channelId: 1, campaignTypeId: 1, sendDate: "2026-10-18" },
      ],
      thresholds: [rule(100, 30, 1)],
      overrides: new Set(),
      audienceByTouch,
    });
    expect(out.totalFlaggedDonors).toBe(1);
    expect(out.conflicts[0]!.projectedCount).toBe(2);
  });

  it("override suppresses the conflict from the flagged-donor count", () => {
    const planned = [
      touch(1, "2026-03-01"),
      touch(2, "2026-03-08"),
      touch(3, "2026-03-15"),
    ];
    const audience = new Set(["00000001"]);
    const audienceByTouch = new Map<number, Set<string>>(
      planned.map((p) => [p.id, audience]),
    );
    const out = computeThresholdConflicts({
      planned,
      history: [],
      thresholds: [rule(100, 30, 1)],
      overrides: new Set(["00000001"]),
      audienceByTouch,
    });
    expect(out.conflicts.length).toBeGreaterThan(0);
    expect(out.conflicts[0]!.overridden).toBe(true);
  });
});

