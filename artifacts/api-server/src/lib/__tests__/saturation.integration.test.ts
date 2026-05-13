/**
 * Integration tests for `computeSaturation` — the channel × week
 * aggregation that backs `GET /reports/saturation`.
 *
 * Verifies the rules the report card depends on:
 *   - Seed touchpoints are excluded
 *   - Voided campaigns are excluded
 *   - Touches outside the [start, start + weeks*7) window are excluded
 *   - Cells aggregate touchpoint counts by ISO-week Monday
 *   - Contributing campaigns are listed (deduped, with names resolved)
 *   - The report has one row per active channel even when the channel has
 *     zero touchpoints in the window (heatmap shape stays stable)
 *   - Per-channel capacity is read from `app_settings.channel_capacity`
 *
 * Skipped when DATABASE_URL is unset so the unit suite still runs offline.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  db,
  closeDb,
  usersTable,
  channelsTable,
  campaignTypesTable,
  campaignsTable,
  touchesTable,
  touchpointsTable,
  appSettingsTable,
} from "@workspace/db";
import {
  computeSaturation,
  isoWeekMonday,
  validateChannelCapacity,
} from "../saturation";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

interface Fixture {
  userId: number;
  channelAId: number;
  channelBId: number;
  channelCId: number;
  campaignTypeId: number;
  liveCampaignId: number;
  voidedCampaignId: number;
  otherUnitCampaignId: number;
  /** Monday of the anchor week (used as `start` to computeSaturation). */
  startMonday: string;
  /** A date inside week 0. */
  inWindowDate: string;
  /** A date past the 4-week horizon — must be excluded. */
  outOfWindowDate: string;
  prevCapacity: Record<string, number>;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function seedFixture(): Promise<Fixture> {
  const tag = `sattest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `${tag}@example.com`,
      name: `Sat Test ${tag}`,
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
    .values({ name: `${tag}-direct-mail`, active: true })
    .returning();
  // Inactive channel — should not appear in the report.
  const [chC] = await db
    .insert(channelsTable)
    .values({ name: `${tag}-zzz-retired`, active: false })
    .returning();
  const [ct] = await db
    .insert(campaignTypesTable)
    .values({ name: `${tag}-annual`, active: true })
    .returning();
  const [live] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} live campaign`,
      status: "exported",
      submittedByUserId: user.id,
      owningUnit: `${tag}-unit-alpha`,
    })
    .returning();
  const [voided] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} voided campaign`,
      status: "voided",
      submittedByUserId: user.id,
      voidedAt: new Date(),
      owningUnit: `${tag}-unit-alpha`,
    })
    .returning();
  // Same channels & window, but a different owning unit — used to prove the
  // owningUnit filter excludes non-matching campaigns.
  const [otherUnit] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} other-unit campaign`,
      status: "exported",
      submittedByUserId: user.id,
      owningUnit: `${tag}-unit-beta`,
    })
    .returning();

  // Anchor "today" deterministically. Use a fixed Monday far enough in the
  // future to avoid accidental overlap with other test fixtures.
  const startMonday = isoWeekMonday("2030-01-07"); // 2030-01-07 is itself a Monday
  const inWindowDate = addDays(startMonday, 2); // mid-week 0
  const outOfWindowDate = addDays(startMonday, 7 * 5); // week 5, beyond a 4-week horizon

  // Need a touch row to satisfy touchpoints.touchId FK.
  const [touchA] = await db
    .insert(touchesTable)
    .values({
      campaignId: live.id,
      touchName: "Wave A",
      channelId: chA.id,
      campaignTypeId: ct.id,
      sendDate: inWindowDate,
    })
    .returning();
  const [touchB] = await db
    .insert(touchesTable)
    .values({
      campaignId: live.id,
      touchName: "Wave B",
      channelId: chB.id,
      campaignTypeId: ct.id,
      sendDate: inWindowDate,
    })
    .returning();
  const [touchVoided] = await db
    .insert(touchesTable)
    .values({
      campaignId: voided.id,
      touchName: "Voided wave",
      channelId: chA.id,
      campaignTypeId: ct.id,
      sendDate: inWindowDate,
    })
    .returning();

  const baseRow = {
    campaignId: live.id,
    touchId: touchA.id,
    channelId: chA.id,
    campaignTypeId: ct.id,
    sendDate: inWindowDate,
    isSeed: false,
    countsTowardThreshold: true,
  };
  // Channel A in week 0 — 3 real touchpoints + 1 seed (must be excluded).
  await db.insert(touchpointsTable).values([
    { ...baseRow, donorId: "00000001" },
    { ...baseRow, donorId: "00000002" },
    { ...baseRow, donorId: "00000003" },
    { ...baseRow, donorId: "00000099", isSeed: true },
  ]);
  // Channel B in week 0 — 1 touchpoint.
  await db.insert(touchpointsTable).values({
    ...baseRow,
    touchId: touchB.id,
    channelId: chB.id,
    donorId: "00000010",
  });
  // Voided-campaign touchpoint — must be excluded.
  await db.insert(touchpointsTable).values({
    campaignId: voided.id,
    touchId: touchVoided.id,
    channelId: chA.id,
    campaignTypeId: ct.id,
    sendDate: inWindowDate,
    donorId: "00000020",
    isSeed: false,
    countsTowardThreshold: true,
  });
  // Out-of-window touchpoint — must be excluded.
  await db.insert(touchpointsTable).values({
    ...baseRow,
    sendDate: outOfWindowDate,
    donorId: "00000030",
  });
  // Other-owning-unit touchpoint on channel A in week 0 — must be excluded
  // when the owningUnit filter pins to alpha.
  const [touchOther] = await db
    .insert(touchesTable)
    .values({
      campaignId: otherUnit.id,
      touchName: "Beta wave",
      channelId: chA.id,
      campaignTypeId: ct.id,
      sendDate: inWindowDate,
    })
    .returning();
  await db.insert(touchpointsTable).values({
    campaignId: otherUnit.id,
    touchId: touchOther.id,
    channelId: chA.id,
    campaignTypeId: ct.id,
    sendDate: inWindowDate,
    donorId: "00000040",
    isSeed: false,
    countsTowardThreshold: true,
  });

  // Stash the existing capacity map so we can restore it after the test.
  const [settingsBefore] = await db
    .select()
    .from(appSettingsTable)
    .limit(1);
  const prev = settingsBefore?.channelCapacity ?? {};
  await db
    .update(appSettingsTable)
    .set({ channelCapacity: { [String(chA.id)]: 100 } })
    .where(eq(appSettingsTable.id, settingsBefore?.id ?? 1));

  return {
    userId: user.id,
    channelAId: chA.id,
    channelBId: chB.id,
    channelCId: chC.id,
    campaignTypeId: ct.id,
    liveCampaignId: live.id,
    voidedCampaignId: voided.id,
    otherUnitCampaignId: otherUnit.id,
    startMonday,
    inWindowDate,
    outOfWindowDate,
    prevCapacity: prev,
  };
}

async function teardown(fx: Fixture): Promise<void> {
  // Touchpoints + touches cascade off campaigns; campaigns cascade-deletes
  // both. Channels and types we created are leaf rows.
  await db.delete(campaignsTable).where(eq(campaignsTable.id, fx.liveCampaignId));
  await db.delete(campaignsTable).where(eq(campaignsTable.id, fx.voidedCampaignId));
  await db.delete(campaignsTable).where(eq(campaignsTable.id, fx.otherUnitCampaignId));
  await db.delete(channelsTable).where(eq(channelsTable.id, fx.channelAId));
  await db.delete(channelsTable).where(eq(channelsTable.id, fx.channelBId));
  await db.delete(channelsTable).where(eq(channelsTable.id, fx.channelCId));
  await db.delete(campaignTypesTable).where(eq(campaignTypesTable.id, fx.campaignTypeId));
  // Restore prior capacity map.
  await db
    .update(appSettingsTable)
    .set({ channelCapacity: fx.prevCapacity })
    .where(sql`${appSettingsTable.id} = (SELECT id FROM ${appSettingsTable} ORDER BY id LIMIT 1)`);
}

d("computeSaturation (DB integration)", () => {
  let fx: Fixture;
  beforeAll(async () => {
    fx = await seedFixture();
    const [row] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, fx.liveCampaignId));
    _alphaCache.set(fx.liveCampaignId, row!.owningUnit!);
  }, 30000);
  afterAll(async () => { await teardown(fx); await closeDb(); });

  it("aggregates by week × channel, excluding seeds, voids, and out-of-window rows", async () => {
    const report = await computeSaturation({
      start: fx.startMonday,
      weeks: 4,
    });

    expect(report.startDate).toBe(fx.startMonday);
    expect(report.weeks).toHaveLength(4);
    expect(report.weeks[0].weekStart).toBe(fx.startMonday);
    expect(report.weeks[3].weekStart).toBe(addDays(fx.startMonday, 21));

    // Channel A row: capacity from app_settings; week 0 cell aggregates 3
    // alpha + 1 beta touchpoints (seed dropped, voided dropped). Both
    // contributing campaigns are listed; owningUnit-filtered counts are
    // covered by the dedicated owningUnit test below.
    const rowA = report.channels.find((c) => c.channelId === fx.channelAId);
    expect(rowA, "channel A must appear in the heatmap").toBeDefined();
    expect(rowA!.capacity).toBe(100);
    expect(rowA!.cells).toHaveLength(4);
    expect(rowA!.cells[0].touchpointCount).toBe(4);
    expect(rowA!.cells[0].campaigns.map((c) => c.id).sort()).toEqual(
      [fx.liveCampaignId, fx.otherUnitCampaignId].sort(),
    );
    // Later weeks must be empty (the week-5 row was filtered out).
    expect(rowA!.cells.slice(1).every((c) => c.touchpointCount === 0)).toBe(true);
    expect(rowA!.cells.slice(1).every((c) => c.campaigns.length === 0)).toBe(true);

    // Channel B row: no capacity configured → null; week 0 cell = 1.
    const rowB = report.channels.find((c) => c.channelId === fx.channelBId);
    expect(rowB).toBeDefined();
    expect(rowB!.capacity).toBeNull();
    expect(rowB!.cells[0].touchpointCount).toBe(1);

    // Inactive channel C must NOT appear when no channel filter is set.
    expect(report.channels.find((c) => c.channelId === fx.channelCId)).toBeUndefined();
  });

  it("respects owningUnit filter and excludes campaigns from other units", async () => {
    // With no filter, channel A in week 0 should see both alpha (3) and beta (1) → 4.
    const unfiltered = await computeSaturation({ start: fx.startMonday, weeks: 4 });
    const rowA_all = unfiltered.channels.find((c) => c.channelId === fx.channelAId)!;
    expect(rowA_all.cells[0].touchpointCount).toBe(4);
    expect(rowA_all.cells[0].campaigns.map((c) => c.id).sort()).toEqual(
      [fx.liveCampaignId, fx.otherUnitCampaignId].sort(),
    );

    // Pinned to alpha → only the live (alpha) campaign contributes; beta drops out.
    const alpha = await computeSaturation({
      start: fx.startMonday,
      weeks: 4,
      owningUnit: unfilteredUnitAlphaName(fx),
    });
    const rowA_alpha = alpha.channels.find((c) => c.channelId === fx.channelAId)!;
    expect(rowA_alpha.cells[0].touchpointCount).toBe(3);
    expect(rowA_alpha.cells[0].campaigns).toEqual([
      { id: fx.liveCampaignId, name: expect.stringContaining("live campaign") },
    ]);

    // Pinned to a non-existent unit → all cells empty.
    const empty = await computeSaturation({
      start: fx.startMonday,
      weeks: 4,
      owningUnit: "no-such-unit-xyz",
    });
    expect(empty.channels.every((c) => c.cells.every((cell) => cell.touchpointCount === 0))).toBe(true);
  });

  it("never includes donor-level identifiers in the response payload", async () => {
    // Defense-in-depth: the saturation report aggregates at week × channel
    // and exposes only campaign id + name. A regression that joined the
    // donor_id column into the projection would leak constituent identifiers
    // through a report endpoint that admins access broadly.
    const report = await computeSaturation({ start: fx.startMonday, weeks: 4 });
    const serialized = JSON.stringify(report);
    // The fixture's donor IDs are 8-digit zero-padded strings (00000001…).
    expect(serialized).not.toMatch(/\b\d{8}\b/);
    // And no field literally named donorId should appear anywhere.
    expect(serialized).not.toContain("donorId");
    expect(serialized).not.toContain("donor_id");
  });

  it("respects channelId filter and renders only that channel", async () => {
    const report = await computeSaturation({
      start: fx.startMonday,
      weeks: 4,
      channelId: fx.channelBId,
    });
    expect(report.channels).toHaveLength(1);
    expect(report.channels[0].channelId).toBe(fx.channelBId);
    expect(report.channels[0].cells[0].touchpointCount).toBe(1);
  });
});

// Helper: derive the alpha unit name from the tag baked into the fixture's
// live-campaign name. Keeps the unit name in sync with seedFixture without
// threading another field through the Fixture interface.
function unfilteredUnitAlphaName(fx: Fixture): string {
  // live campaign name is `${tag} live campaign`, so the tag is everything
  // before the first space. The owning unit is `${tag}-unit-alpha`.
  // We resolve it through the DB so we don't duplicate the tag derivation.
  // (Sync-style fallback below uses an awaited cache.)
  return _alphaCache.get(fx.liveCampaignId)!;
}
const _alphaCache = new Map<number, string>();

describe("validateChannelCapacity (pure)", () => {
  it("accepts a valid map and drops zero values", () => {
    expect(validateChannelCapacity({ "1": 500, "2": 0, "3": 1000 })).toEqual({
      "1": 500,
      "3": 1000,
    });
  });
  it("rejects non-object input", () => {
    expect(() => validateChannelCapacity(null)).toThrow();
    expect(() => validateChannelCapacity([])).toThrow();
    expect(() => validateChannelCapacity("nope")).toThrow();
  });
  it("rejects non-positive-integer keys", () => {
    expect(() => validateChannelCapacity({ "abc": 5 })).toThrow();
    expect(() => validateChannelCapacity({ "0": 5 })).toThrow();
    expect(() => validateChannelCapacity({ "-1": 5 })).toThrow();
  });
  it("rejects negative or non-integer or oversized values", () => {
    expect(() => validateChannelCapacity({ "1": -1 })).toThrow();
    expect(() => validateChannelCapacity({ "1": 1.5 })).toThrow();
    expect(() => validateChannelCapacity({ "1": 99_999_999 })).toThrow();
    expect(() => validateChannelCapacity({ "1": "5" as unknown as number })).toThrow();
  });
});
