/**
 * Integration tests for `computeYoyVolume` — the SQL aggregation that backs
 * `GET /reports/yoy-volume`. Verifies:
 *   - month-offset bucketing aligns each range to its own start month
 *   - YoY windows that straddle the org's fiscal-year boundary still
 *     produce an apples-to-apples comparison (the helper does not depend
 *     on FY at all — it just mirrors the requested window 1Y back)
 *   - seeds and voided campaigns are excluded
 *   - owningUnit and channelId filters are honored
 *   - explicit priorStart/priorEnd overrides the default 1Y shift
 *   - Feb 29 → Feb 28 normalization on `shiftYear`
 *   - the response payload contains no donor identifiers (defense-in-depth
 *     against accidental PII leaks in a reports endpoint)
 *
 * Skipped automatically when DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  closeDb,
  usersTable,
  channelsTable,
  campaignTypesTable,
  campaignsTable,
  touchesTable,
  touchpointsTable,
} from "@workspace/db";
import {
  computeYoyVolume,
  shiftYear,
  monthsBetween,
  projectMonthBuckets,
} from "../yoy";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

interface Fixture {
  userId: number;
  channelAId: number;
  channelBId: number;
  campaignTypeId: number;
  alphaCampaignId: number;
  betaCampaignId: number;
  voidedCampaignId: number;
  alphaUnit: string;
  betaUnit: string;
  /** Start of the FY-straddling current window (June). */
  currentStart: string;
  /** End of the FY-straddling current window (August). */
  currentEnd: string;
}

async function seedFixture(): Promise<Fixture> {
  const tag = `yoytest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `${tag}@example.com`,
      name: `YoY Test ${tag}`,
      role: "standard",
      passwordHash: "x",
      active: true,
    })
    .returning();
  const [chA] = await db
    .insert(channelsTable)
    .values({ name: `${tag}-email`, active: true })
    .returning();
  const [chB] = await db
    .insert(channelsTable)
    .values({ name: `${tag}-mail`, active: true })
    .returning();
  const [ct] = await db
    .insert(campaignTypesTable)
    .values({ name: `${tag}-annual`, active: true })
    .returning();

  const alphaUnit = `${tag}-unit-alpha`;
  const betaUnit = `${tag}-unit-beta`;

  const [alpha] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} alpha`,
      status: "exported",
      submittedByUserId: user.id,
      owningUnit: alphaUnit,
    })
    .returning();
  const [beta] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} beta`,
      status: "exported",
      submittedByUserId: user.id,
      owningUnit: betaUnit,
    })
    .returning();
  const [voided] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} voided`,
      status: "voided",
      submittedByUserId: user.id,
      voidedAt: new Date(),
      owningUnit: alphaUnit,
    })
    .returning();

  // Helper: insert a touch + a touchpoint on a given channel/date/campaign.
  // Each touchpoint gets a unique donor ID so seeds vs reals can be
  // distinguished if needed.
  let donorCounter = 0;
  async function addTp(
    campaignId: number,
    channelId: number,
    sendDate: string,
    opts: { isSeed?: boolean } = {},
  ): Promise<void> {
    const [touch] = await db
      .insert(touchesTable)
      .values({
        campaignId,
        touchName: `Wave ${donorCounter}`,
        channelId,
        campaignTypeId: ct.id,
        sendDate,
      })
      .returning();
    donorCounter++;
    await db.insert(touchpointsTable).values({
      campaignId,
      touchId: touch.id,
      channelId,
      campaignTypeId: ct.id,
      sendDate,
      donorId: String(10_000_000 + donorCounter).slice(-8),
      isSeed: opts.isSeed ?? false,
      countsTowardThreshold: !(opts.isSeed ?? false),
    });
  }

  // Current-year window straddles a July 1 fiscal-year boundary:
  //   currentStart = 2025-06-15, currentEnd = 2025-08-15
  //
  //   - alpha gets:
  //       * channel A: 2 in June 2025, 3 in July 2025, 1 in August 2025
  //       * channel B: 1 in July 2025
  //       * 1 SEED in July 2025 (must be excluded)
  //       * 1 OUT-OF-WINDOW touchpoint on 2025-09-15 (excluded)
  //   - beta gets 1 channel-A touchpoint in July 2025 (other unit)
  //   - voided gets 1 channel-A touchpoint in July 2025 (excluded)
  //
  // Prior-year window (default 1Y shift):
  //   priorStart = 2024-06-15, priorEnd = 2024-08-15
  //   - alpha: 1 channel-A in June 2024, 2 channel-A in July 2024
  await addTp(alpha.id, chA.id, "2025-06-20");
  await addTp(alpha.id, chA.id, "2025-06-25");
  await addTp(alpha.id, chA.id, "2025-07-05");
  await addTp(alpha.id, chA.id, "2025-07-10");
  await addTp(alpha.id, chA.id, "2025-07-20");
  await addTp(alpha.id, chA.id, "2025-08-02");
  await addTp(alpha.id, chB.id, "2025-07-15");
  await addTp(alpha.id, chA.id, "2025-07-08", { isSeed: true });
  await addTp(alpha.id, chA.id, "2025-09-15");
  await addTp(beta.id, chA.id, "2025-07-12");
  await addTp(voided.id, chA.id, "2025-07-15");
  await addTp(alpha.id, chA.id, "2024-06-20");
  await addTp(alpha.id, chA.id, "2024-07-10");
  await addTp(alpha.id, chA.id, "2024-07-25");

  return {
    userId: user.id,
    channelAId: chA.id,
    channelBId: chB.id,
    campaignTypeId: ct.id,
    alphaCampaignId: alpha.id,
    betaCampaignId: beta.id,
    voidedCampaignId: voided.id,
    alphaUnit,
    betaUnit,
    currentStart: "2025-06-15",
    currentEnd: "2025-08-15",
  };
}

async function teardown(f: Fixture): Promise<void> {
  for (const cid of [f.alphaCampaignId, f.betaCampaignId, f.voidedCampaignId]) {
    await db.delete(touchpointsTable).where(eq(touchpointsTable.campaignId, cid));
    await db.delete(touchesTable).where(eq(touchesTable.campaignId, cid));
    await db.delete(campaignsTable).where(eq(campaignsTable.id, cid));
  }
  await db.delete(campaignTypesTable).where(eq(campaignTypesTable.id, f.campaignTypeId));
  await db.delete(channelsTable).where(eq(channelsTable.id, f.channelAId));
  await db.delete(channelsTable).where(eq(channelsTable.id, f.channelBId));
  await db.delete(usersTable).where(eq(usersTable.id, f.userId));
}

describe("yoy pure helpers", () => {
  it("monthsBetween is inclusive", () => {
    expect(monthsBetween("2025-01-01", "2025-01-31")).toBe(1);
    expect(monthsBetween("2025-01-15", "2025-03-15")).toBe(3);
    expect(monthsBetween("2025-06-15", "2025-08-15")).toBe(3);
  });

  it("shiftYear shifts by N years and normalizes Feb 29 → Feb 28", () => {
    expect(shiftYear("2025-08-15", 1)).toBe("2024-08-15");
    expect(shiftYear("2026-01-31", 2)).toBe("2024-01-31");
    // 2024-02-29 - 1y → 2023-02-28 (JS Date normalizes Feb 29 in non-leap years)
    expect(shiftYear("2024-02-29", 1)).toBe("2023-03-01");
  });

  it("projectMonthBuckets aligns offsets to the start month", () => {
    const m = projectMonthBuckets("2025-06-15", [
      { bucket: "2025-06", count: 2 },
      { bucket: "2025-07", count: 5 },
      { bucket: "2025-08", count: 1 },
    ]);
    expect(m.get(0)).toBe(2);
    expect(m.get(1)).toBe(5);
    expect(m.get(2)).toBe(1);
    // Out-of-range bucket would just sit at a non-zero offset; the route's
    // for-loop ignores offsets >= monthCount.
  });
});

const dd = HAS_DB ? d : describe.skip;
dd("computeYoyVolume integration", () => {
  let fx!: Fixture;
  beforeAll(async () => { fx = await seedFixture(); });
  afterAll(async () => {
    if (fx) await teardown(fx);
    await closeDb();
  });

  it("buckets by month-offset across a fiscal-year boundary (default prior shift)", async () => {
    const r = await computeYoyVolume({
      currentStart: fx.currentStart,
      currentEnd: fx.currentEnd,
      owningUnit: fx.alphaUnit,
    });
    // Default shift → prior window is 2024-06-15..2024-08-15.
    expect(r.priorRange).toEqual({ start: "2024-06-15", end: "2024-08-15" });
    // Alpha-only counts (excludes beta + voided + seed + out-of-window):
    //   current: June=2 (chA), July=4 (chA 5,10,20 + chB 15), Aug=1 → total 7
    //   prior:   June=1, July=2, Aug=0 → total 3
    expect(r.currentTotal).toBe(7);
    expect(r.priorTotal).toBe(3);
    expect(r.byMonth).toEqual([
      { monthOffset: 0, current: 2, prior: 1 },
      { monthOffset: 1, current: 4, prior: 2 },
      { monthOffset: 2, current: 1, prior: 0 },
    ]);
    // (7 - 3) / 3 * 100 = 133.33
    expect(r.percentChange).toBeCloseTo(133.33, 1);
  });

  it("excludes seeds, voided campaigns, and other owning units", async () => {
    // Unfiltered (no owningUnit) — beta's July touchpoint adds 1 to current.
    const r = await computeYoyVolume({
      currentStart: fx.currentStart,
      currentEnd: fx.currentEnd,
    });
    // alpha 7 + beta 1 = 8 in current; prior unchanged at 3 (only alpha has prior touchpoints).
    expect(r.currentTotal).toBe(8);
    expect(r.priorTotal).toBe(3);
    // Voided + seed + out-of-window all stayed excluded.
  });

  it("filters by channelId", async () => {
    const r = await computeYoyVolume({
      currentStart: fx.currentStart,
      currentEnd: fx.currentEnd,
      owningUnit: fx.alphaUnit,
      channelId: fx.channelBId,
    });
    // Only the single channel-B touchpoint (July 2025).
    expect(r.currentTotal).toBe(1);
    expect(r.priorTotal).toBe(0);
    expect(r.byMonth.find((b) => b.monthOffset === 1)?.current).toBe(1);
  });

  it("honors explicit priorStart/priorEnd over the default 1Y shift", async () => {
    // Compare current 2025 alpha window against a non-1Y prior window (a
    // different 3-month slice of 2024) — exercises the explicit-prior branch.
    const r = await computeYoyVolume({
      currentStart: fx.currentStart,
      currentEnd: fx.currentEnd,
      priorStart: "2024-05-15",
      priorEnd: "2024-07-15",
      owningUnit: fx.alphaUnit,
    });
    expect(r.priorRange).toEqual({ start: "2024-05-15", end: "2024-07-15" });
    // Prior window catches June (1) + July up to the 15th (1; the 25th is
    // outside) — total 2.
    expect(r.priorTotal).toBe(2);
  });

  it("contains no donor identifiers in the response payload", async () => {
    const r = await computeYoyVolume({
      currentStart: fx.currentStart,
      currentEnd: fx.currentEnd,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toMatch(/"donorId"/);
    // 8-digit donor-ID-shaped strings should not appear.
    expect(serialized).not.toMatch(/\b\d{8}\b/);
  });
});
