import { describe, it, expect } from "vitest";
import {
  buildOverrideReasonPrompt,
  buildCampaignBriefPrompt,
  fuzzyMatchScore,
  matchBriefExtraction,
} from "../../routes/ai";
import { assertNoPii, AiPiiBlockedError } from "../ai";

describe("buildOverrideReasonPrompt", () => {
  it("includes the rule name, limit, and projected count in the user prompt", () => {
    const prompt = buildOverrideReasonPrompt({
      thresholdName: "Email 14d Cap",
      scope: "channel",
      windowDays: 14,
      maxAllowed: 3,
      projectedCount: 4,
      channelLabel: "Email",
      campaignTypeLabel: null,
    });
    expect(prompt.user).toContain("Email 14d Cap");
    expect(prompt.user).toContain('"maxAllowed": 3');
    expect(prompt.user).toContain('"projectedCount": 4');
    // System guardrail must explicitly forbid identifying info
    expect(prompt.system).toMatch(/identif/i);
    expect(prompt.system).toMatch(/short/i);
  });
});

describe("assertNoPii guards override-reason facts", () => {
  it("rejects facts containing a constituent-id-shaped value (defense-in-depth)", () => {
    const facts = {
      thresholdName: "Email 14d Cap",
      scope: "channel",
      windowDays: 14,
      maxAllowed: 3,
      projectedCount: 4,
      channelLabel: "Email",
      campaignTypeLabel: null,
      leakedNote: "Donor 12345678 keeps appearing",
    };
    expect(() => assertNoPii(facts, "facts")).toThrow(AiPiiBlockedError);
  });

  it("accepts a clean facts object", () => {
    expect(() =>
      assertNoPii(
        {
          thresholdName: "Email 14d Cap",
          scope: "channel",
          windowDays: 14,
          maxAllowed: 3,
          projectedCount: 4,
          channelLabel: "Email",
          campaignTypeLabel: null,
        },
        "facts",
      ),
    ).not.toThrow();
  });
});

describe("PII guard scans the full campaign-brief prompt payload", () => {
  it("rejects when a taxonomy label (e.g. owning-unit name) contains PII", () => {
    const prompt = buildCampaignBriefPrompt({
      brief: "Generic giving push.",
      channels: [{ name: "Email" }],
      types: [{ name: "Annual" }],
      units: [{ name: "Office of jane.doe@example.com Outreach" }],
    });
    expect(() => assertNoPii(prompt, "campaignBriefPrompt")).toThrow(AiPiiBlockedError);
  });

  it("accepts a clean prompt", () => {
    const prompt = buildCampaignBriefPrompt({
      brief: "Generic giving push.",
      channels: [{ name: "Email" }],
      types: [{ name: "Annual" }],
      units: [{ name: "Office of Annual Giving" }],
    });
    expect(() => assertNoPii(prompt, "campaignBriefPrompt")).not.toThrow();
  });
});

describe("buildCampaignBriefPrompt", () => {
  it("includes the brief text and the allowlists for channels, types, and units", () => {
    const prompt = buildCampaignBriefPrompt({
      brief: "End of year giving push for engineering alumni.",
      channels: [{ name: "Email" }, { name: "Phone" }],
      types: [{ name: "Annual" }, { name: "Engineering Annual Fund" }],
      units: [{ name: "College of Engineering" }, { name: "Office of Annual Giving" }],
    });
    expect(prompt.user).toContain("End of year giving push for engineering alumni.");
    expect(prompt.user).toContain('["Email","Phone"]');
    expect(prompt.user).toContain("Engineering Annual Fund");
    expect(prompt.user).toContain("College of Engineering");
    // Strict-JSON guardrail
    expect(prompt.system).toMatch(/STRICT JSON/);
  });
});

describe("assertNoPii guards the brief input", () => {
  it("rejects a brief containing an email address", () => {
    expect(() =>
      assertNoPii("Reach out to jane.doe@example.com about the renewal push.", "brief"),
    ).toThrow(AiPiiBlockedError);
  });

  it("rejects a brief containing a constituent id", () => {
    expect(() =>
      assertNoPii("Make sure constituent 00123456 is included.", "brief"),
    ).toThrow(AiPiiBlockedError);
  });

  it("accepts a brief with only generic descriptive language", () => {
    expect(() =>
      assertNoPii(
        "End-of-year giving push for College of Engineering alumni who gave in FY24.",
        "brief",
      ),
    ).not.toThrow();
  });
});

describe("fuzzyMatchScore", () => {
  it("returns 1 for case-insensitive exact match", () => {
    expect(fuzzyMatchScore("annual fund", "Annual Fund")).toBe(1);
  });
  it("returns 0.85 for substring match", () => {
    expect(fuzzyMatchScore("Engineering", "College of Engineering")).toBe(0.85);
  });
  it("returns 0 for unrelated strings", () => {
    expect(fuzzyMatchScore("Phonathon", "Annual Fund")).toBe(0);
  });
  it("handles empty strings safely", () => {
    expect(fuzzyMatchScore("", "Annual Fund")).toBe(0);
    expect(fuzzyMatchScore("anything", "")).toBe(0);
  });
});

describe("matchBriefExtraction", () => {
  const channels = [{ name: "Email" }, { name: "Phone" }];
  const types = [
    { id: 1, name: "Annual" },
    { id: 2, name: "Engineering Annual Fund" },
    { id: 3, name: "Major Gifts" },
  ];
  const units = [
    { name: "College of Engineering" },
    { name: "Office of Annual Giving" },
  ];

  it("matches type and unit names against the active taxonomy and dedupes", () => {
    const out = matchBriefExtraction(
      {
        name: "FY26 Engineering EOY",
        owningUnit: "Engineering",
        intendedSendStartDate: "2026-06-01",
        campaignTypeNames: ["Engineering Annual Fund", "Annual", "Engineering Annual Fund"],
        touches: [
          { order: 1, channelLabel: "Email", dayOffset: 0, purpose: "Kickoff" },
          { order: 2, channelLabel: "Email", dayOffset: 7, purpose: "Reminder" },
          { order: 3, channelLabel: "Phone", dayOffset: 14, purpose: "Top-tier follow-up" },
        ],
        notes: "Optional cleanup pass before launch.",
      },
      { channels, types, units },
    );
    expect(out.name).toBe("FY26 Engineering EOY");
    expect(out.intendedSendStartDate).toBe("2026-06-01");
    // Both types matched; sorted by confidence (exact > substring); deduped.
    expect(out.campaignTypeIds).toEqual([2, 1]);
    expect(out.campaignTypeMatches[0]).toMatchObject({ id: 2, confidence: 1 });
    expect(out.owningUnitMatch).toMatchObject({ name: "College of Engineering", confidence: 0.85 });
    expect(out.touches).toHaveLength(3);
    expect(out.notes).toBe("Optional cleanup pass before launch.");
  });

  it("drops touches whose channel is not in the active channel list", () => {
    const out = matchBriefExtraction(
      {
        name: "X",
        touches: [
          { order: 1, channelLabel: "Email", dayOffset: 0, purpose: "k" },
          { order: 2, channelLabel: "Direct Mail", dayOffset: 7, purpose: "removed" },
        ],
      },
      { channels, types, units },
    );
    expect(out.touches).toHaveLength(1);
    expect(out.touches[0].channelLabel).toBe("Email");
  });

  it("drops dates that are not ISO YYYY-MM-DD (no fabrication)", () => {
    const out = matchBriefExtraction(
      { name: "x", intendedSendStartDate: "next Tuesday" },
      { channels, types, units },
    );
    expect(out.intendedSendStartDate).toBeNull();
  });

  it("drops syntactically-ISO but impossible calendar dates", () => {
    for (const bad of ["2026-99-99", "2026-02-30", "2026-13-01", "2026-00-10"]) {
      const out = matchBriefExtraction(
        { name: "x", intendedSendStartDate: bad },
        { channels, types, units },
      );
      expect(out.intendedSendStartDate).toBeNull();
    }
    const ok = matchBriefExtraction(
      { name: "x", intendedSendStartDate: "2026-06-01" },
      { channels, types, units },
    );
    expect(ok.intendedSendStartDate).toBe("2026-06-01");
  });

  it("clamps negative dayOffset to 0 and caps the touch list at 6", () => {
    const out = matchBriefExtraction(
      {
        name: "x",
        touches: Array.from({ length: 10 }, (_, i) => ({
          order: i + 1,
          channelLabel: "Email",
          dayOffset: i === 0 ? -5 : i,
          purpose: `t${i}`,
        })),
      },
      { channels, types, units },
    );
    expect(out.touches).toHaveLength(6);
    expect(out.touches[0].dayOffset).toBe(0);
  });

  it("returns empty matches when the model invents type/unit names", () => {
    const out = matchBriefExtraction(
      {
        name: "x",
        owningUnit: "Department of Imaginary Affairs",
        campaignTypeNames: ["Stewardship Newsletter"],
      },
      { channels, types, units },
    );
    expect(out.owningUnitMatch).toBeNull();
    expect(out.campaignTypeIds).toEqual([]);
    expect(out.campaignTypeMatches).toEqual([]);
  });
});
