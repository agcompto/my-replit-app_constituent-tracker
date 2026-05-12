import { describe, it, expect } from "vitest";
import {
  planClone,
  resolveShiftDays,
  shiftIsoDate,
  type CloneSourceTouch,
  type CloneSourceSuppression,
} from "../cloneCampaign";

const baseTouch = (id: number, sendDate: string): CloneSourceTouch => ({
  id,
  touchName: `Touch ${id}`,
  channelId: 1,
  campaignTypeId: 2,
  sendDate,
  notes: null,
  audienceMode: "campaign",
});

describe("resolveShiftDays", () => {
  it("returns 0 when no explicit shift and either side is missing", () => {
    expect(
      resolveShiftDays({ newIntendedSendDate: null, sourceIntendedSendDate: "2026-01-01" }),
    ).toBe(0);
    expect(
      resolveShiftDays({ newIntendedSendDate: "2026-01-01", sourceIntendedSendDate: null }),
    ).toBe(0);
    expect(
      resolveShiftDays({ newIntendedSendDate: null, sourceIntendedSendDate: null }),
    ).toBe(0);
  });

  it("derives the day-delta when both sides are present", () => {
    expect(
      resolveShiftDays({
        newIntendedSendDate: "2026-02-01",
        sourceIntendedSendDate: "2026-01-01",
      }),
    ).toBe(31);
    expect(
      resolveShiftDays({
        newIntendedSendDate: "2026-01-01",
        sourceIntendedSendDate: "2026-02-15",
      }),
    ).toBe(-45);
  });

  it("explicit shift overrides the implicit delta", () => {
    expect(
      resolveShiftDays({
        newIntendedSendDate: "2026-06-01",
        sourceIntendedSendDate: "2026-01-01",
        explicitShiftDays: 7,
      }),
    ).toBe(7);
    expect(
      resolveShiftDays({
        newIntendedSendDate: null,
        sourceIntendedSendDate: null,
        explicitShiftDays: -3,
      }),
    ).toBe(-3);
  });
});

describe("shiftIsoDate", () => {
  it("shifts forward across a month boundary", () => {
    expect(shiftIsoDate("2026-01-30", 5)).toBe("2026-02-04");
  });
  it("shifts backward across a year boundary", () => {
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("zero shift is identity", () => {
    expect(shiftIsoDate("2026-04-15", 0)).toBe("2026-04-15");
  });
});

describe("planClone", () => {
  it("copies touches and shifts their send dates by the resolved delta", () => {
    const plan = planClone({
      touches: [baseTouch(10, "2026-01-05"), baseTouch(11, "2026-01-12")],
      thresholds: [],
      suppressions: [],
      seeds: [],
      options: {
        newIntendedSendDate: "2026-02-01",
        sourceIntendedSendDate: "2026-01-01",
      },
    });
    expect(plan.shiftDays).toBe(31);
    expect(plan.touches.map((t) => t.sendDate)).toEqual([
      "2026-02-05",
      "2026-02-12",
    ]);
    // sourceId is preserved for the route's touch-id map.
    expect(plan.touches.map((t) => t.sourceId)).toEqual([10, 11]);
  });

  it("preserves audienceMode but the route is responsible for resetting custom counts", () => {
    const plan = planClone({
      touches: [
        { ...baseTouch(1, "2026-01-01"), audienceMode: "custom" },
        { ...baseTouch(2, "2026-01-02"), audienceMode: "campaign" },
      ],
      thresholds: [],
      suppressions: [],
      seeds: [],
      options: { newIntendedSendDate: null, sourceIntendedSendDate: null },
    });
    expect(plan.touches.map((t) => t.audienceMode)).toEqual(["custom", "campaign"]);
  });

  it("copies thresholds verbatim", () => {
    const plan = planClone({
      touches: [],
      thresholds: [
        {
          name: "Cap email",
          maxTouchpoints: 3,
          windowDays: 30,
          scope: "channel",
          channelId: 1,
          campaignTypeId: null,
          actionMode: "block",
        },
      ],
      suppressions: [],
      seeds: [],
      options: { newIntendedSendDate: null, sourceIntendedSendDate: null },
    });
    expect(plan.thresholds).toHaveLength(1);
    expect(plan.thresholds[0]).toMatchObject({
      name: "Cap email",
      maxTouchpoints: 3,
      windowDays: 30,
      scope: "channel",
      channelId: 1,
      actionMode: "block",
    });
  });

  it("copies scope-only suppressions and skips donor-ID-specific or touch-scoped ones", () => {
    const sup = (
      partial: Partial<CloneSourceSuppression>,
    ): CloneSourceSuppression => ({
      scope: "all",
      channelId: null,
      campaignTypeId: null,
      touchId: null,
      reasonCodeId: null,
      reason: null,
      notes: null,
      donorIds: [],
      ...partial,
    });
    const plan = planClone({
      touches: [],
      thresholds: [],
      suppressions: [
        sup({ scope: "all", reason: "Do not contact" }),
        sup({ scope: "channel", channelId: 1 }),
        sup({ scope: "campaign_type", campaignTypeId: 2 }),
        // skipped — has donor IDs
        sup({ scope: "all", donorIds: ["00000001", "00000002"] }),
        // skipped — touch-scoped (tied to source touch)
        sup({ scope: "touch", touchId: 99 }),
        // skipped — touch-scoped even when donor list is empty
        sup({ scope: "touch", touchId: 100, donorIds: [] }),
      ],
      seeds: [],
      options: { newIntendedSendDate: null, sourceIntendedSendDate: null },
    });
    expect(plan.suppressions).toHaveLength(3);
    expect(plan.suppressions.map((s) => s.scope)).toEqual([
      "all",
      "channel",
      "campaign_type",
    ]);
    expect(plan.suppressions.every((s) => s.touchId === null)).toBe(true);
    expect(plan.suppressions.every((s) => s.donorIds.length === 0)).toBe(true);
    expect(plan.skippedSuppressions).toBe(3);
  });

  it("copies all seeds including donor-ID lists; touch remap is the route's job", () => {
    const plan = planClone({
      touches: [],
      thresholds: [],
      suppressions: [],
      seeds: [
        { scope: "all", channelId: null, touchId: null, donorIds: ["00000001"] },
        { scope: "touch", channelId: null, touchId: 42, donorIds: ["00000002", "00000003"] },
      ],
      options: { newIntendedSendDate: null, sourceIntendedSendDate: null },
    });
    expect(plan.seeds).toHaveLength(2);
    expect(plan.seeds[0]).toMatchObject({ scope: "all", sourceTouchId: null });
    expect(plan.seeds[0].donorIds).toEqual(["00000001"]);
    expect(plan.seeds[1]).toMatchObject({ scope: "touch", sourceTouchId: 42 });
    expect(plan.seeds[1].donorIds).toEqual(["00000002", "00000003"]);
  });

  it("explicit shift overrides the implicit (new - source) delta on touches", () => {
    const plan = planClone({
      touches: [baseTouch(1, "2026-01-10")],
      thresholds: [],
      suppressions: [],
      seeds: [],
      options: {
        newIntendedSendDate: "2026-06-01",
        sourceIntendedSendDate: "2026-01-01",
        explicitShiftDays: 3,
      },
    });
    expect(plan.shiftDays).toBe(3);
    expect(plan.touches[0].sendDate).toBe("2026-01-13");
  });
});
