/**
 * Integration tests for `lib/auditLog.ts` query construction. Verifies
 * that the WHERE/ORDER/cursor pieces produce the right filtered, ordered,
 * paginated row sets when run against a real Postgres.
 *
 * Skipped when DATABASE_URL is unset so the unit suite still runs offline.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb, usersTable, auditLogTable } from "@workspace/db";
import {
  AUDIT_ORDER,
  buildAuditWhere,
  buildCursorPredicate,
  combineWhere,
  decodeCursor,
  encodeCursor,
  MAX_AUDIT_EXPORT_ROWS,
} from "../auditLog";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

interface Fixture {
  tag: string;
  alice: number;
  bob: number;
  campaignId: number;
  targetUserId: number;
  rowIds: number[];
}

async function seed(): Promise<Fixture> {
  const tag = `audittest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [alice] = await db
    .insert(usersTable)
    .values({
      email: `${tag}-alice@example.com`,
      name: `Alice ${tag}`,
      role: "admin",
      passwordHash: "x",
      active: true,
    })
    .returning();
  const [bob] = await db
    .insert(usersTable)
    .values({
      email: `${tag}-bob@example.com`,
      name: `Bob ${tag}`,
      role: "standard",
      passwordHash: "x",
      active: true,
    })
    .returning();
  const campaignId = 99_000_000 + Math.floor(Math.random() * 100_000);
  const targetUserId = bob.id;

  // Six audit rows spanning two actors, two action types, and two entity types.
  // createdAt is supplied explicitly to make ordering deterministic; the table
  // has no UPDATE/DELETE trigger blocking inserts.
  const baseDate = Date.UTC(2025, 0, 1, 12, 0, 0);
  const rows = [
    {
      actorUserId: alice.id,
      actorName: alice.name,
      actorRole: "admin",
      action: "create_user",
      entityType: "user",
      entityId: targetUserId,
      details: `${tag} alice invited bob`,
      createdAt: new Date(baseDate + 0),
    },
    {
      actorUserId: alice.id,
      actorName: alice.name,
      actorRole: "admin",
      action: "reset_password",
      entityType: "user",
      entityId: targetUserId,
      details: `${tag} alice reset bob`,
      createdAt: new Date(baseDate + 1000),
    },
    {
      actorUserId: bob.id,
      actorName: bob.name,
      actorRole: "standard",
      action: "create_campaign",
      entityType: "campaign",
      entityId: campaignId,
      details: `${tag} bob spun up campaign`,
      createdAt: new Date(baseDate + 2000),
    },
    {
      actorUserId: bob.id,
      actorName: bob.name,
      actorRole: "standard",
      action: "export_campaign",
      entityType: "campaign",
      entityId: campaignId,
      details: `${tag} bob exported`,
      createdAt: new Date(baseDate + 3000),
    },
    {
      actorUserId: alice.id,
      actorName: alice.name,
      actorRole: "admin",
      action: "delete_campaign",
      entityType: "campaign",
      entityId: campaignId,
      details: `${tag} alice deleted (search-target-marker)`,
      createdAt: new Date(baseDate + 4000),
    },
    {
      actorUserId: alice.id,
      actorName: alice.name,
      actorRole: "admin",
      action: "update_settings",
      entityType: "settings",
      entityId: null,
      details: `${tag} alice tweaked settings`,
      createdAt: new Date(baseDate + 5000),
    },
  ];
  const inserted = await db.insert(auditLogTable).values(rows).returning({ id: auditLogTable.id });
  return {
    tag,
    alice: alice.id,
    bob: bob.id,
    campaignId,
    targetUserId,
    rowIds: inserted.map((r) => r.id),
  };
}

let fx: Fixture;

d("auditLog integration", () => {
  beforeAll(async () => {
    fx = await seed();
  });
  afterAll(async () => {
    // Cleanup intentionally omitted: audit_log rows FK to users.id and the
    // audit_log_no_delete / audit_log_no_update triggers block both DELETE
    // and UPDATE, so we cannot drop or detach the seeded users. The seeded
    // rows are namespaced by `tag` so they cannot collide with real data,
    // and the seeded users are throwaway test fixtures.
    await closeDb();
  });

  async function runQuery(where: ReturnType<typeof buildAuditWhere>, limit = 50) {
    return db
      .select()
      .from(auditLogTable)
      .where(where ?? sql`true`)
      .orderBy(...AUDIT_ORDER)
      .limit(limit);
  }

  function onlyOurs<T extends { id: number }>(rows: T[]): T[] {
    const ids = new Set(fx.rowIds);
    return rows.filter((r) => ids.has(r.id));
  }

  it("filters by actorId", async () => {
    const rows = onlyOurs(await runQuery(buildAuditWhere({ actorId: fx.alice })));
    expect(rows.length).toBe(4); // alice did 4 of 6 actions
    expect(rows.every((r) => r.actorUserId === fx.alice)).toBe(true);
  });

  it("filters by action[] with multiple values", async () => {
    const rows = onlyOurs(
      await runQuery(buildAuditWhere({ actions: ["create_user", "delete_campaign"] })),
    );
    expect(rows.map((r) => r.action).sort()).toEqual(["create_user", "delete_campaign"]);
  });

  it("filters by campaignId (entity-scoped)", async () => {
    const rows = onlyOurs(await runQuery(buildAuditWhere({ campaignId: fx.campaignId })));
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.entityType === "campaign" && r.entityId === fx.campaignId)).toBe(true);
  });

  it("filters by targetUserId (entity-scoped)", async () => {
    const rows = onlyOurs(await runQuery(buildAuditWhere({ targetUserId: fx.targetUserId })));
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.entityType === "user" && r.entityId === fx.targetUserId)).toBe(true);
  });

  it("filters by free-text q over details", async () => {
    const rows = onlyOurs(await runQuery(buildAuditWhere({ q: "search-target-marker" })));
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe("delete_campaign");
  });

  it("free-text q does not interpret % or _ as wildcards", async () => {
    // None of our seeded details contain a literal '%', so this should match nothing.
    const rows = onlyOurs(await runQuery(buildAuditWhere({ q: "%target%" })));
    expect(rows.length).toBe(0);
  });

  it("filters by date range (inclusive)", async () => {
    const rows = onlyOurs(
      await runQuery(buildAuditWhere({ from: "2025-01-01", to: "2025-01-01" })),
    );
    // All seeded rows are on 2025-01-01 UTC.
    expect(rows.length).toBe(6);
    const empty = onlyOurs(
      await runQuery(buildAuditWhere({ from: "2024-01-01", to: "2024-12-31" })),
    );
    expect(empty.length).toBe(0);
  });

  it("combines actorId + action[] AND-style", async () => {
    const rows = onlyOurs(
      await runQuery(
        buildAuditWhere({ actorId: fx.alice, actions: ["create_user", "delete_campaign"] }),
      ),
    );
    expect(rows.map((r) => r.action).sort()).toEqual(["create_user", "delete_campaign"]);
    expect(rows.every((r) => r.actorUserId === fx.alice)).toBe(true);
  });

  it("orders newest-first by (createdAt desc, id desc)", async () => {
    const rows = onlyOurs(await runQuery(buildAuditWhere({ campaignId: fx.campaignId })));
    const ts = rows.map((r) => r.createdAt.getTime());
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]).toBeLessThanOrEqual(ts[i - 1]);
    }
  });

  it("cursor paginates without overlap or gap", async () => {
    // Constrain to our fixture set; ask for pages of 3.
    const where = buildAuditWhere({
      // tag-based search picks up exactly our 6 rows
      q: fx.tag,
    });
    const page1 = await runQuery(where, 3);
    expect(page1.length).toBe(3);
    const last = page1[page1.length - 1];
    const cursor = encodeCursor({ ts: last.createdAt.getTime(), id: last.id });
    const dec = decodeCursor(cursor);
    expect(dec.ok).toBe(true);
    if (!dec.ok) return;
    const page2 = await runQuery(combineWhere(where, buildCursorPredicate(dec.value)), 3);
    expect(page2.length).toBe(3);
    const idsP1 = new Set(page1.map((r) => r.id));
    for (const r of page2) expect(idsP1.has(r.id)).toBe(false);
    expect([...page1, ...page2].length).toBe(6);
  });

  it("MAX_AUDIT_EXPORT_ROWS is the documented 50_000", () => {
    expect(MAX_AUDIT_EXPORT_ROWS).toBe(50_000);
  });

  it("count query matches the WHERE used by the page query", async () => {
    const where = buildAuditWhere({ q: fx.tag });
    const rows = await runQuery(where, 100);
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .where(where ?? sql`true`);
    expect(count[0].n).toBe(rows.length);
  });

  it("audit_log_no_delete trigger remains in place", async () => {
    let blocked = false;
    try {
      await db.delete(auditLogTable).where(and(eq(auditLogTable.id, fx.rowIds[0])));
    } catch {
      blocked = true;
    }
    expect(blocked).toBe(true);
  });
});
