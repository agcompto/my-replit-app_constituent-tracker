import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { db, usersTable } from "@workspace/db";
import { requireAuth, audit } from "../lib/auth";

const router: IRouter = Router();

const savedConstituentSearchesTable = pgTable("saved_constituent_searches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  searchStateJson: jsonb("search_state_json").$type<Record<string, unknown>>().notNull().default({}),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

type SavedConstituentSearchRow = typeof savedConstituentSearchesTable.$inferSelect;

let ensureTablePromise: Promise<void> | null = null;

function ensureSavedConstituentSearchesTable(): Promise<void> {
  ensureTablePromise ??= (async () => {
    await db.execute(sql`
      create table if not exists saved_constituent_searches (
        id serial primary key,
        user_id integer not null references users(id) on delete cascade,
        name text not null,
        search_state_json jsonb not null default '{}'::jsonb,
        is_favorite boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await db.execute(sql`
      create index if not exists saved_constituent_searches_user_updated_idx
      on saved_constituent_searches (user_id, updated_at desc)
    `);
    await db.execute(sql`
      create index if not exists saved_constituent_searches_user_favorite_idx
      on saved_constituent_searches (user_id, is_favorite)
    `);
  })();

  return ensureTablePromise;
}

function serialize(row: SavedConstituentSearchRow) {
  return {
    id: row.id,
    name: row.name,
    searchState: row.searchStateJson ?? {},
    isFavorite: row.isFavorite,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) return null;
  return trimmed;
}

function normalizeSearchState(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return value;
}

router.get("/saved-constituent-searches", requireAuth, async (req, res): Promise<void> => {
  await ensureSavedConstituentSearchesTable();
  const userId = req.currentUser!.id;
  const rows = await db
    .select()
    .from(savedConstituentSearchesTable)
    .where(eq(savedConstituentSearchesTable.userId, userId))
    .orderBy(desc(savedConstituentSearchesTable.isFavorite), desc(savedConstituentSearchesTable.updatedAt));

  res.json(rows.map(serialize));
});

router.post("/saved-constituent-searches", requireAuth, async (req, res): Promise<void> => {
  await ensureSavedConstituentSearchesTable();
  const name = normalizeName((req.body as { name?: unknown }).name);
  const searchState = normalizeSearchState((req.body as { searchState?: unknown }).searchState);
  const isFavorite = (req.body as { isFavorite?: unknown }).isFavorite === true;

  if (!name) {
    res.status(400).json({ error: "Name is required and must be 100 characters or fewer." });
    return;
  }
  if (!searchState) {
    res.status(400).json({ error: "searchState must be an object." });
    return;
  }

  const [row] = await db
    .insert(savedConstituentSearchesTable)
    .values({
      userId: req.currentUser!.id,
      name,
      searchStateJson: searchState,
      isFavorite,
      updatedAt: new Date(),
    })
    .returning();

  await audit({
    actor: req.currentUser!,
    action: "create_saved_constituent_search",
    entityType: "saved_constituent_search",
    entityId: row.id,
    details: row.name,
  });

  res.status(201).json(serialize(row));
});

router.patch("/saved-constituent-searches/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureSavedConstituentSearchesTable();
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(savedConstituentSearchesTable)
    .where(and(eq(savedConstituentSearchesTable.id, id), eq(savedConstituentSearchesTable.userId, req.currentUser!.id)));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const update: Partial<typeof savedConstituentSearchesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if ("name" in req.body) {
    const name = normalizeName((req.body as { name?: unknown }).name);
    if (!name) {
      res.status(400).json({ error: "Name must be 100 characters or fewer." });
      return;
    }
    update.name = name;
  }

  if ("searchState" in req.body) {
    const searchState = normalizeSearchState((req.body as { searchState?: unknown }).searchState);
    if (!searchState) {
      res.status(400).json({ error: "searchState must be an object." });
      return;
    }
    update.searchStateJson = searchState;
  }

  if ("isFavorite" in req.body) {
    update.isFavorite = (req.body as { isFavorite?: unknown }).isFavorite === true;
  }

  const [row] = await db
    .update(savedConstituentSearchesTable)
    .set(update)
    .where(and(eq(savedConstituentSearchesTable.id, id), eq(savedConstituentSearchesTable.userId, req.currentUser!.id)))
    .returning();

  res.json(serialize(row));
});

router.delete("/saved-constituent-searches/:id", requireAuth, async (req, res): Promise<void> => {
  await ensureSavedConstituentSearchesTable();
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(savedConstituentSearchesTable)
    .where(and(eq(savedConstituentSearchesTable.id, id), eq(savedConstituentSearchesTable.userId, req.currentUser!.id)));

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(savedConstituentSearchesTable)
    .where(and(eq(savedConstituentSearchesTable.id, id), eq(savedConstituentSearchesTable.userId, req.currentUser!.id)));

  await audit({
    actor: req.currentUser!,
    action: "delete_saved_constituent_search",
    entityType: "saved_constituent_search",
    entityId: existing.id,
    details: existing.name,
  });

  res.status(204).end();
});

export default router;
