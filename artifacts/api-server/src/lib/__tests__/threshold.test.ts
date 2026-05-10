import { describe, it, expect } from "vitest";
import { resolveEffectiveAudienceByTouch, type PlannedTouch } from "../threshold";

const touch = (id: number, mode: "campaign" | "custom"): PlannedTouch => ({
  id,
  channelId: 1,
  campaignTypeId: 1,
  sendDate: "2026-01-01",
  channelLabel: "Email",
  campaignTypeLabel: "Annual",
  touchName: `Touch ${id}`,
  audienceMode: mode,
});

describe("resolveEffectiveAudienceByTouch", () => {
  it("campaign-only: every touch shares the campaign-wide audience", () => {
    const campaign = new Set(["00000001", "00000002", "00000003"]);
    const result = resolveEffectiveAudienceByTouch(
      campaign,
      new Map(),
      [touch(10, "campaign"), touch(11, "campaign")],
    );
    expect(result.size).toBe(2);
    expect(Array.from(result.get(10)!).sort()).toEqual(["00000001", "00000002", "00000003"]);
    expect(Array.from(result.get(11)!).sort()).toEqual(["00000001", "00000002", "00000003"]);

    const union = new Set<string>();
    for (const s of result.values()) for (const d of s) union.add(d);
    expect(Array.from(union).sort()).toEqual(["00000001", "00000002", "00000003"]);
  });

  it("all-custom: each touch uses only its own list and they may differ", () => {
    const campaign = new Set(["99999999"]); // should be ignored
    const customByTouch = new Map<number, Set<string>>([
      [10, new Set(["00000001", "00000002"])],
      [11, new Set(["00000003"])],
    ]);
    const result = resolveEffectiveAudienceByTouch(
      campaign,
      customByTouch,
      [touch(10, "custom"), touch(11, "custom")],
    );
    expect(Array.from(result.get(10)!).sort()).toEqual(["00000001", "00000002"]);
    expect(Array.from(result.get(11)!).sort()).toEqual(["00000003"]);
    expect(result.get(10)!.has("99999999")).toBe(false);
    expect(result.get(11)!.has("99999999")).toBe(false);

    const union = new Set<string>();
    for (const s of result.values()) for (const d of s) union.add(d);
    expect(Array.from(union).sort()).toEqual(["00000001", "00000002", "00000003"]);
  });

  it("mixed: custom touches use their own lists; campaign touches use campaign-wide", () => {
    const campaign = new Set(["00000001", "00000002", "00000003"]);
    const customByTouch = new Map<number, Set<string>>([
      [11, new Set(["00000004", "00000005"])],
    ]);
    const result = resolveEffectiveAudienceByTouch(
      campaign,
      customByTouch,
      [
        touch(10, "campaign"),
        touch(11, "custom"),
        touch(12, "campaign"),
      ],
    );
    expect(Array.from(result.get(10)!).sort()).toEqual(["00000001", "00000002", "00000003"]);
    expect(Array.from(result.get(11)!).sort()).toEqual(["00000004", "00000005"]);
    expect(Array.from(result.get(12)!).sort()).toEqual(["00000001", "00000002", "00000003"]);

    const union = new Set<string>();
    for (const s of result.values()) for (const d of s) union.add(d);
    expect(Array.from(union).sort()).toEqual([
      "00000001", "00000002", "00000003", "00000004", "00000005",
    ]);
  });

  it("custom touch with no uploaded list yields an empty set (does not fall back to campaign)", () => {
    const campaign = new Set(["00000001", "00000002"]);
    const result = resolveEffectiveAudienceByTouch(
      campaign,
      new Map(), // no custom rows for touch 11
      [touch(11, "custom")],
    );
    expect(result.get(11)!.size).toBe(0);
  });
});
