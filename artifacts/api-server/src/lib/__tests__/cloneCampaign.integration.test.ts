/**
 * Integration test for `executeClone` — the transactional core of
 * `POST /campaigns/:id/clone`.
 *
 * Exercises the real PostgreSQL DB via the workspace `db` client. Verifies:
 *   - touches, thresholds, scope-only suppressions, and seeds are copied
 *   - audience donors, per-touch overrides, upload jobs, export jobs,
 *     recorded touchpoints, and the source's audit history are NOT copied
 *   - `campaign_cloned` audit row is present
 *   - touch send dates are shifted by the implicit (new - source) delta
 *
 * Skipped automatically when `DATABASE_URL` is not set so the unit-test
 * suite still runs in environments without a database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  db,
  closeDb,
  usersTable,
  channelsTable,
  campaignTypesTable,
  campaignsTable,
  campaignTypeLinksTable,
  audienceDonorsTable,
  touchesTable,
  touchAudienceDonorsTable,
  thresholdsTable,
  suppressionsTable,
  seedGroupsTable,
  uploadJobsTable,
  exportJobsTable,
  touchpointsTable,
  auditLogTable,
} from "@workspace/db";
import { executeClone } from "../cloneCampaign";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

interface Fixture {
  userId: number;
  channelId: number;
  campaignTypeId: number;
  sourceId: number;
  sourceTouchIds: number[];
}

async function seedFixture(): Promise<Fixture> {
  const tag = `clonetest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `${tag}@example.com`,
      name: `Clone Test ${tag}`,
      role: "standard",
      passwordHash: "x",
      active: true,
    })
    .returning();
  const [channel] = await db
    .insert(channelsTable)
    .values({ name: `${tag}-email`, active: true })
    .returning();
  const [campaignType] = await db
    .insert(campaignTypesTable)
    .values({ name: `${tag}-annual`, active: true })
    .returning();
  const [src] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} source`,
      status: "exported",
      owningUnit: "Annual Giving",
      submittedByUserId: user.id,
      intendedSendStartDate: "2026-01-01",
      audienceDescription: "Lapsed donors",
      salesforceCampaignId: "SF-123",
      internalNotes: "internal",
      validIdCount: 3,
      uniqueIdCount: 3,
    })
    .returning();
  await db
    .insert(campaignTypeLinksTable)
    .values({ campaignId: src.id, campaignTypeId: campaignType.id });
  await db.insert(audienceDonorsTable).values([
    { campaignId: src.id, donorId: "00000001" },
    { campaignId: src.id, donorId: "00000002" },
    { campaignId: src.id, donorId: "00000003" },
  ]);
  const [t1] = await db
    .insert(touchesTable)
    .values({
      campaignId: src.id,
      touchName: "Wave 1",
      channelId: channel.id,
      campaignTypeId: campaignType.id,
      sendDate: "2026-01-10",
      audienceMode: "campaign",
    })
    .returning();
  const [t2] = await db
    .insert(touchesTable)
    .values({
      campaignId: src.id,
      touchName: "Wave 2",
      channelId: channel.id,
      campaignTypeId: campaignType.id,
      sendDate: "2026-01-20",
      audienceMode: "custom",
      customValidIdCount: 2,
    })
    .returning();
  // per-touch override audience for the custom touch — must NOT carry over.
  await db.insert(touchAudienceDonorsTable).values([
    { touchId: t2.id, donorId: "00000001" },
    { touchId: t2.id, donorId: "00000002" },
  ]);
  await db.insert(thresholdsTable).values({
    campaignId: src.id,
    name: "Cap email",
    maxTouchpoints: 3,
    windowDays: 30,
    scope: "channel",
    channelId: channel.id,
    actionMode: "block",
  });
  await db.insert(suppressionsTable).values([
    {
      campaignId: src.id,
      scope: "all",
      reason: "Do not contact",
      donorIds: [],
      createdByUserId: user.id,
    },
    {
      campaignId: src.id,
      scope: "channel",
      channelId: channel.id,
      donorIds: [],
      createdByUserId: user.id,
    },
    // Skip — donor-id-specific
    {
      campaignId: src.id,
      scope: "all",
      donorIds: ["00000001"],
      createdByUserId: user.id,
    },
    // Skip — touch-scoped (tied to source touch)
    {
      campaignId: src.id,
      scope: "touch",
      touchId: t1.id,
      donorIds: [],
      createdByUserId: user.id,
    },
  ]);
  await db.insert(seedGroupsTable).values([
    {
      campaignId: src.id,
      scope: "all",
      donorIds: ["00000099"],
      createdByUserId: user.id,
    },
    {
      campaignId: src.id,
      scope: "touch",
      touchId: t2.id,
      donorIds: ["00000098"],
      createdByUserId: user.id,
    },
  ]);
  // Upload + export + touchpoint history attached to source. None must leak.
  await db.insert(uploadJobsTable).values({
    campaignId: src.id,
    uploadedByUserId: user.id,
    source: "paste",
    validCount: 3,
    rejectedCount: 0,
  });
  await db.insert(exportJobsTable).values({
    campaignId: src.id,
    exportedByUserId: user.id,
    fileName: "test.csv",
    rowCount: 3,
  });
  await db.insert(touchpointsTable).values({
    campaignId: src.id,
    touchId: t1.id,
    donorId: "00000001",
    sendDate: "2026-01-10",
    channelId: channel.id,
    campaignTypeId: campaignType.id,
    isSeed: false,
    countsTowardThreshold: true,
  });
  // Audit history on the source — must not be copied to clone.
  await db.insert(auditLogTable).values({
    actorUserId: user.id,
    actorName: user.name,
    actorRole: "standard",
    action: "create_campaign",
    entityType: "campaign",
    entityId: src.id,
    details: "source",
  });

  return {
    userId: user.id,
    channelId: channel.id,
    campaignTypeId: campaignType.id,
    sourceId: src.id,
    sourceTouchIds: [t1.id, t2.id],
  };
}

async function teardown(fx: Fixture, cloneId: number | null): Promise<void> {
  // Children cascade off campaigns; uploads/exports/touchpoints/seeds via FK.
  if (cloneId != null) {
    await db.delete(campaignsTable).where(eq(campaignsTable.id, cloneId));
  }
  await db.delete(campaignsTable).where(eq(campaignsTable.id, fx.sourceId));
  await db.delete(channelsTable).where(eq(channelsTable.id, fx.channelId));
  await db
    .delete(campaignTypesTable)
    .where(eq(campaignTypesTable.id, fx.campaignTypeId));
  // The user row and any audit_log rows it created are intentionally left
  // behind — audit_log is append-only at the DB layer (DELETE blocked by
  // trigger), and a per-run unique email tag keeps the leftover rows from
  // colliding with future test runs.
}

d("executeClone (DB integration)", () => {
  let fx: Fixture;
  let cloneId: number | null = null;

  beforeAll(async () => {
    fx = await seedFixture();
  }, 30000);
  afterAll(async () => {
    await teardown(fx, cloneId);
    await closeDb();
  });

  it("copies structural setup, skips audience/history, writes audit, shifts dates", async () => {
    const result = await db.transaction((tx) =>
      executeClone(tx, {
        sourceCampaignId: fx.sourceId,
        actingUserId: fx.userId,
        actingUserName: "Clone Test",
        actingUserRole: "standard",
        newName: "Clone target",
        newIntendedSendDate: "2026-02-01",
      }),
    );
    cloneId = result.newCampaignId;

    expect(result.copiedTouches).toBe(2);
    expect(result.copiedThresholds).toBe(1);
    // 2 copiable (all, channel) + 2 skipped (donor-id, touch).
    expect(result.copiedSuppressions).toBe(2);
    expect(result.skippedSuppressions).toBe(2);
    expect(result.copiedSeeds).toBe(2);
    expect(result.shiftDays).toBe(31);

    // New campaign exists, status reset to draft, salesforceCampaignId cleared.
    const [clone] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, cloneId!));
    expect(clone.status).toBe("draft");
    expect(clone.salesforceCampaignId).toBeNull();
    expect(clone.submittedByUserId).toBe(fx.userId);
    expect(clone.name).toBe("Clone target");
    // Upload-stat columns reset to defaults — audience didn't carry.
    expect(clone.validIdCount).toBe(0);
    expect(clone.uniqueIdCount).toBe(0);

    // Touches copied with shifted send dates and a fresh PK.
    const cloneTouches = await db
      .select()
      .from(touchesTable)
      .where(eq(touchesTable.campaignId, cloneId!))
      .orderBy(touchesTable.sendDate);
    expect(cloneTouches).toHaveLength(2);
    expect(cloneTouches.map((t) => t.sendDate)).toEqual([
      "2026-02-10",
      "2026-02-20",
    ]);
    expect(cloneTouches.every((t) => !fx.sourceTouchIds.includes(t.id))).toBe(true);
    // Custom-mode flag carries over but custom counts reset.
    const cloneCustom = cloneTouches.find((t) => t.audienceMode === "custom");
    expect(cloneCustom).toBeDefined();
    expect(cloneCustom!.customValidIdCount).toBe(0);

    // Per-touch override audience NOT copied.
    const cloneTouchOverrides = await db
      .select()
      .from(touchAudienceDonorsTable)
      .where(eq(touchAudienceDonorsTable.touchId, cloneCustom!.id));
    expect(cloneTouchOverrides).toHaveLength(0);

    // Audience donors NOT copied.
    const cloneAudience = await db
      .select()
      .from(audienceDonorsTable)
      .where(eq(audienceDonorsTable.campaignId, cloneId!));
    expect(cloneAudience).toHaveLength(0);

    // Thresholds copied.
    const cloneThresholds = await db
      .select()
      .from(thresholdsTable)
      .where(eq(thresholdsTable.campaignId, cloneId!));
    expect(cloneThresholds).toHaveLength(1);
    expect(cloneThresholds[0].name).toBe("Cap email");

    // Suppressions: only scope-only, no donor-ids, no touch-scoped.
    const cloneSuppressions = await db
      .select()
      .from(suppressionsTable)
      .where(eq(suppressionsTable.campaignId, cloneId!));
    expect(cloneSuppressions).toHaveLength(2);
    expect(cloneSuppressions.map((s) => s.scope).sort()).toEqual([
      "all",
      "channel",
    ]);
    expect(cloneSuppressions.every((s) => s.touchId === null)).toBe(true);
    expect(
      cloneSuppressions.every((s) => (s.donorIds ?? []).length === 0),
    ).toBe(true);

    // Seeds copied (donor IDs and touch remap preserved).
    const cloneSeeds = await db
      .select()
      .from(seedGroupsTable)
      .where(eq(seedGroupsTable.campaignId, cloneId!));
    expect(cloneSeeds).toHaveLength(2);
    const seedAll = cloneSeeds.find((s) => s.scope === "all");
    const seedTouch = cloneSeeds.find((s) => s.scope === "touch");
    expect(seedAll?.donorIds).toEqual(["00000099"]);
    expect(seedTouch?.donorIds).toEqual(["00000098"]);
    expect(seedTouch?.touchId).toBe(cloneCustom!.id);

    // Upload/export/touchpoint history NOT copied.
    const cloneUploads = await db
      .select()
      .from(uploadJobsTable)
      .where(eq(uploadJobsTable.campaignId, cloneId!));
    expect(cloneUploads).toHaveLength(0);
    const cloneExports = await db
      .select()
      .from(exportJobsTable)
      .where(eq(exportJobsTable.campaignId, cloneId!));
    expect(cloneExports).toHaveLength(0);
    const cloneTouchpoints = await db
      .select()
      .from(touchpointsTable)
      .where(eq(touchpointsTable.campaignId, cloneId!));
    expect(cloneTouchpoints).toHaveLength(0);

    // Audit row written for the clone, source's history not duplicated.
    const cloneAudit = await db
      .select()
      .from(auditLogTable)
      .where(
        and(
          eq(auditLogTable.entityType, "campaign"),
          eq(auditLogTable.entityId, cloneId!),
        ),
      );
    expect(cloneAudit).toHaveLength(1);
    expect(cloneAudit[0].action).toBe("campaign_cloned");
    expect(cloneAudit[0].actorUserId).toBe(fx.userId);

    // Original campaign untouched: same audience size, same touches, same status.
    const sourceAudience = await db
      .select()
      .from(audienceDonorsTable)
      .where(eq(audienceDonorsTable.campaignId, fx.sourceId));
    expect(sourceAudience).toHaveLength(3);
    const sourceTouchesAfter = await db
      .select()
      .from(touchesTable)
      .where(eq(touchesTable.campaignId, fx.sourceId));
    expect(sourceTouchesAfter).toHaveLength(2);
    const [sourceAfter] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, fx.sourceId));
    expect(sourceAfter.status).toBe("exported");
  });
});
