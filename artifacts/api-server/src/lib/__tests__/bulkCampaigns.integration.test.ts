/**
 * Integration test for the bulk campaign endpoints' core logic against a
 * real PostgreSQL DB. Exercises the same query/update sequence the route
 * handlers use, focused on the failure-mode contract: a single bulk
 * archive request that mixes draft, already-archived, voided, and missing
 * ids must transition only the drafts and report a per-id status for the
 * rest, leaving voided/archived rows untouched.
 *
 * Skipped automatically when DATABASE_URL is not set so the unit suite
 * still runs in environments without a database.
 */
import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  closeDb,
  usersTable,
  campaignsTable,
} from "@workspace/db";
import {
  buildCampaignManifestCsv,
  safeFilenamePart,
} from "../campaignExports";
import {
  channelsTable,
  campaignTypesTable,
  touchesTable,
  touchpointsTable,
  exportJobsTable,
} from "@workspace/db";
import { canMutateCampaign } from "../auth";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

// Close the shared pg pool exactly once after every describe in this file
// has finished. Individual describes that each ran `closeDb()` from their
// own afterAll would tear the pool out from under sibling describes that
// hadn't started yet.
if (HAS_DB) {
  afterAll(async () => {
    await closeDb();
  });
}

interface Fixture {
  userId: number;
  draftId: number;
  archivedId: number;
  voidedId: number;
}

async function seedFixture(): Promise<Fixture> {
  const tag = `bulktest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email: `${tag}@example.com`,
      name: `Bulk ${tag}`,
      role: "admin",
      passwordHash: "x",
      active: true,
    })
    .returning();
  const [draft] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} draft`,
      status: "draft",
      owningUnit: "Annual Giving",
      submittedByUserId: user.id,
      intendedSendStartDate: "2026-02-01",
    })
    .returning();
  const [archived] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} archived`,
      status: "archived",
      owningUnit: "Annual Giving",
      submittedByUserId: user.id,
      archivedAt: new Date(),
      intendedSendStartDate: "2026-02-01",
    })
    .returning();
  const [voided] = await db
    .insert(campaignsTable)
    .values({
      name: `${tag} voided`,
      status: "voided",
      owningUnit: "Annual Giving",
      submittedByUserId: user.id,
      voidedAt: new Date(),
      intendedSendStartDate: "2026-02-01",
    })
    .returning();
  return {
    userId: user.id,
    draftId: draft.id,
    archivedId: archived.id,
    voidedId: voided.id,
  };
}

d("bulk archive partial-failure semantics", () => {
  const created: number[] = [];
  let userId = 0;

  afterAll(async () => {
    if (created.length > 0) {
      await db
        .delete(campaignsTable)
        .where(inArray(campaignsTable.id, created));
    }
    if (userId) await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  it("transitions only eligible campaigns and returns per-id status", async () => {
    const fx = await seedFixture();
    userId = fx.userId;
    created.push(fx.draftId, fx.archivedId, fx.voidedId);
    const missingId = 2_000_000_000;

    const ids = [fx.draftId, fx.archivedId, fx.voidedId, missingId];

    // Mirror of the route handler's logic — the route is intentionally
    // not exercised through Express here so the test is hermetic.
    const existing = await db
      .select({ id: campaignsTable.id, status: campaignsTable.status })
      .from(campaignsTable)
      .where(inArray(campaignsTable.id, ids));
    const byId = new Map(existing.map((r) => [r.id, r] as const));
    const results: Array<{ id: number; status: string }> = [];
    let archivedCount = 0;
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        results.push({ id, status: "not_found" });
        continue;
      }
      if (row.status === "voided") {
        results.push({ id, status: "voided" });
        continue;
      }
      if (row.status === "archived") {
        results.push({ id, status: "already_archived" });
        continue;
      }
      await db
        .update(campaignsTable)
        .set({ status: "archived", archivedAt: new Date() })
        .where(eq(campaignsTable.id, id));
      results.push({ id, status: "archived" });
      archivedCount++;
    }

    expect(archivedCount).toBe(1);
    expect(results).toEqual([
      { id: fx.draftId, status: "archived" },
      { id: fx.archivedId, status: "already_archived" },
      { id: fx.voidedId, status: "voided" },
      { id: missingId, status: "not_found" },
    ]);

    const [draftAfter] = await db
      .select({ status: campaignsTable.status, archivedAt: campaignsTable.archivedAt })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, fx.draftId));
    expect(draftAfter.status).toBe("archived");
    expect(draftAfter.archivedAt).not.toBeNull();

    const [voidedAfter] = await db
      .select({ status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, fx.voidedId));
    expect(voidedAfter.status).toBe("voided");
  });

  it("buildCampaignManifestCsv returns null for never-exported campaigns", async () => {
    const tag = `bulkmanif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [user] = await db
      .insert(usersTable)
      .values({
        email: `${tag}@example.com`,
        name: `Bulk ${tag}`,
        role: "standard",
        passwordHash: "x",
        active: true,
      })
      .returning();
    const [c] = await db
      .insert(campaignsTable)
      .values({
        name: `${tag} never exported`,
        status: "draft",
        owningUnit: "Annual Giving",
        submittedByUserId: user.id,
        intendedSendStartDate: "2026-02-01",
      })
      .returning();
    try {
      const built = await buildCampaignManifestCsv(c.id);
      expect(built).toBeNull();
    } finally {
      await db.delete(campaignsTable).where(eq(campaignsTable.id, c.id));
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
    }
  });
});

d("bulk export per-id authorization (IDOR gate)", () => {
  const cleanup: { campaigns: number[]; users: number[] } = {
    campaigns: [],
    users: [],
  };

  afterAll(async () => {
    if (cleanup.campaigns.length > 0) {
      await db
        .delete(campaignsTable)
        .where(inArray(campaignsTable.id, cleanup.campaigns));
    }
    if (cleanup.users.length > 0) {
      await db
        .delete(usersTable)
        .where(inArray(usersTable.id, cleanup.users));
    }
  });

  it("canMutateCampaign denies a standard user from another unit, blocking IDOR via bulk routes", async () => {
    // The bulk export route loops `canMutateCampaign` over each id and
    // skips anything that returns "forbidden"/"voided"/"not_found", so a
    // standard user submitting another unit's id in a bulk request must
    // be excluded from the resulting ZIP — same gate as the single-touch
    // download route, just applied per-id instead of per-request.
    const tag = `bulkidor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [owner] = await db
      .insert(usersTable)
      .values({
        email: `${tag}-owner@example.com`,
        name: `Owner ${tag}`,
        role: "standard",
        passwordHash: "x",
        active: true,
      })
      .returning();
    const [outsider] = await db
      .insert(usersTable)
      .values({
        email: `${tag}-out@example.com`,
        name: `Outsider ${tag}`,
        role: "standard",
        passwordHash: "x",
        active: true,
      })
      .returning();
    cleanup.users.push(owner.id, outsider.id);
    const [c] = await db
      .insert(campaignsTable)
      .values({
        name: `${tag} owned`,
        status: "draft",
        owningUnit: "Annual Giving",
        submittedByUserId: owner.id,
        intendedSendStartDate: "2026-02-01",
      })
      .returning();
    cleanup.campaigns.push(c.id);

    const ownerAccess = await canMutateCampaign(c.id, {
      id: owner.id,
      email: owner.email,
      name: owner.name,
      role: "standard",
      active: true,
      piiAcknowledged: true,
      mustChangePassword: false,
      totpEnrolled: false,
      totpRequired: false,
    });
    expect(ownerAccess).toBe("allowed");

    const outsiderAccess = await canMutateCampaign(c.id, {
      id: outsider.id,
      email: outsider.email,
      name: outsider.name,
      role: "standard",
      active: true,
      piiAcknowledged: true,
      mustChangePassword: false,
      totpEnrolled: false,
      totpRequired: false,
    });
    expect(outsiderAccess).toBe("forbidden");
  });
});

describe("safeFilenamePart", () => {
  it("strips unsafe characters and falls back to campaign id when empty", () => {
    expect(safeFilenamePart("Annual Giving 2026!", 42)).toBe("Annual_Giving_2026_");
    expect(safeFilenamePart("", 9)).toBe("campaign_9");
  });
});
