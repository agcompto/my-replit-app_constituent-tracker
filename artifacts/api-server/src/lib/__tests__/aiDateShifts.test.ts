import { describe, it, expect } from "vitest";
import { filterDateShiftCandidates } from "../../routes/ai";
import { assertNoPii, AiPiiBlockedError } from "../ai";
import type { PlannedTouch, ThresholdRule } from "../threshold";

const touch = (id: number, sendDate: string, channelId = 1, campaignTypeId = 1): PlannedTouch => ({
  id,
  channelId,
  campaignTypeId,
  sendDate,
  channelLabel: "Email",
  campaignTypeLabel: "Annual",
  touchName: `Touch ${id}`,
  audienceMode: "campaign",
});

describe("filterDateShiftCandidates", () => {
  // Audience: 3 donors. 3 touches in tight window (Mar 8/9/10), threshold
  // "max 2 touches in 14-day Email window" with actionMode=remove ⇒ all donors
  // are excluded at baseline (3 in window > 2). Shifting touch 30 from Mar 10
  // to Mar 22 drops it out of the window and brings each donor down to 2.
  const donors = new Set(["00000001", "00000002", "00000003"]);
  const planned: PlannedTouch[] = [
    touch(10, "2026-03-08"),
    touch(20, "2026-03-09"),
    touch(30, "2026-03-10"),
  ];
  const audienceByTouch = new Map<number, Set<string>>([
    [10, donors],
    [20, donors],
    [30, donors],
  ]);
  const thresholds: ThresholdRule[] = [
    {
      id: 100,
      name: "Email 5d",
      scope: "channel",
      channelId: 1,
      campaignTypeId: null,
      windowDays: 5,
      maxTouchpoints: 2,
    },
  ];
  const thresholdsWithAction = [{ id: 100, actionMode: "remove" }];

  it("keeps the improving candidate, drops the non-improving one, with server-trusted counts", () => {
    const out = filterDateShiftCandidates({
      planned,
      audienceByTouch,
      thresholds,
      thresholdsWithAction,
      history: [],
      overrides: new Set(),
      currentExcluded: 3,
      candidates: [
        // Non-improving: still inside the 14-day window
        { touchId: 30, proposedSendDate: "2026-03-12", rationale: "tiny shift" },
        // Improving: well outside the 14-day window from Mar 8
        { touchId: 20, proposedSendDate: "2026-03-15", rationale: "spread out" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].touchId).toBe(20);
    expect(out[0].proposedSendDate).toBe("2026-03-15");
    // Server-recomputed values, not whatever the model said.
    expect(out[0].projectedExcludedAfter).toBe(0);
    expect(out[0].projectedExcludedDelta).toBe(3);
  });

  it("returns no suggestions when no candidate strictly improves", () => {
    const out = filterDateShiftCandidates({
      planned,
      audienceByTouch,
      thresholds,
      thresholdsWithAction,
      history: [],
      overrides: new Set(),
      currentExcluded: 3,
      candidates: [
        { touchId: 30, proposedSendDate: "2026-03-12", rationale: "tiny shift" },
      ],
    });
    expect(out).toEqual([]);
  });

  it("dedupes multiple candidates for the same touch", () => {
    const out = filterDateShiftCandidates({
      planned,
      audienceByTouch,
      thresholds,
      thresholdsWithAction,
      history: [],
      overrides: new Set(),
      currentExcluded: 3,
      candidates: [
        { touchId: 20, proposedSendDate: "2026-03-15", rationale: "first" },
        { touchId: 20, proposedSendDate: "2026-03-16", rationale: "second" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].rationale).toBe("first");
  });
});

describe("assertNoPii guards date-shift payloads", () => {
  it("rejects a payload that includes a donor-shaped string", () => {
    const payload = {
      currentExcludedCount: 100,
      touches: [
        { touchId: 1, channelLabel: "Email", currentSendDate: "2026-03-08", audienceSize: 1234 },
        { touchId: 2, channelLabel: "Email", currentSendDate: "2026-03-09", audienceSize: 1234, donorIdLeak: "12345678" },
      ],
    };
    expect(() => assertNoPii(payload, "facts")).toThrow(AiPiiBlockedError);
  });

  it("accepts a clean structured payload", () => {
    const payload = {
      currentExcludedCount: 100,
      thresholdRules: [{ id: 100, windowDays: 14, maxTouchpoints: 2, scope: "channel" }],
      touches: [
        { touchId: 1, channelLabel: "Email", currentSendDate: "2026-03-08", audienceSize: 1234 },
      ],
    };
    expect(() => assertNoPii(payload, "facts")).not.toThrow();
  });
});
