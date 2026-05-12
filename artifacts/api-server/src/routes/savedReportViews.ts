import { Router, type IRouter } from "express";
import { and, eq, or } from "drizzle-orm";
import { db, savedReportViewsTable, usersTable } from "@workspace/db";
import {
  CreateSavedReportViewBody,
  UpdateSavedReportViewBody,
} from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";

const router: IRouter = Router();

const ALLOWED_VIEW_TYPES = new Set([
  "dashboard",
  "channels",
  "types",
  "upcoming",
  "high-volume",
  "cohort",
  "yoy",
  "saturation",
]);

type ViewRow = typeof savedReportViewsTable.$inferSelect;

function serialize(r: ViewRow, ownerName?: string | null, isOwner = true) {
  return {
    id: r.id,
    name: r.name,
    viewType: r.viewType,
    visibility: r.visibility,
    isOwner,
    ownerName: ownerName ?? null,
    filters: r.filtersJson ?? {},
    config: r.configJson ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function normalizeVisibility(v: unknown): "private" | "org" {
  return v === "org" ? "org" : "private";
}

router.get("/saved-report-views", requireAuth, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const viewType = typeof req.query.viewType === "string" ? req.query.viewType : undefined;
  // A user sees: their own views (any visibility) + org-shared views from anyone.
  const visibilityCond = or(
    eq(savedReportViewsTable.userId, userId),
    eq(savedReportViewsTable.visibility, "org"),
  )!;
  const where = viewType
    ? and(visibilityCond, eq(savedReportViewsTable.viewType, viewType))!
    : visibilityCond;
  const rows = await db
    .select({
      v: savedReportViewsTable,
      ownerName: usersTable.name,
    })
    .from(savedReportViewsTable)
    .leftJoin(usersTable, eq(usersTable.id, savedReportViewsTable.userId))
    .where(where)
    .orderBy(savedReportViewsTable.name);
  res.json(rows.map((r) => serialize(r.v, r.ownerName, r.v.userId === userId)));
});

router.post("/saved-report-views", requireAuth, async (req, res): Promise<void> => {
  const body = CreateSavedReportViewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!ALLOWED_VIEW_TYPES.has(body.data.viewType)) {
    res.status(400).json({ error: "Unknown viewType" });
    return;
  }
  const visibility = normalizeVisibility(
    (body.data as { visibility?: unknown }).visibility,
  );
  const [row] = await db
    .insert(savedReportViewsTable)
    .values({
      userId: req.currentUser!.id,
      name: body.data.name.trim(),
      viewType: body.data.viewType,
      visibility,
      filtersJson: (body.data.filters ?? {}) as Record<string, unknown>,
      configJson: (body.data.config ?? {}) as Record<string, unknown>,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_saved_report_view",
    entityType: "saved_report_view",
    entityId: row.id,
    details: `${row.viewType} (${row.visibility}): ${row.name}`,
  });
  res.status(201).json(serialize(row, req.currentUser!.name, true));
});

router.patch("/saved-report-views/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateSavedReportViewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [existing] = await db
    .select()
    .from(savedReportViewsTable)
    .where(eq(savedReportViewsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== req.currentUser!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (body.data.viewType && !ALLOWED_VIEW_TYPES.has(body.data.viewType)) {
    res.status(400).json({ error: "Unknown viewType" });
    return;
  }
  const update: Partial<typeof savedReportViewsTable.$inferInsert> = {};
  if (body.data.name !== undefined) update.name = body.data.name.trim();
  if (body.data.viewType !== undefined) update.viewType = body.data.viewType;
  if (body.data.filters !== undefined) update.filtersJson = body.data.filters as Record<string, unknown>;
  if (body.data.config !== undefined) update.configJson = body.data.config as Record<string, unknown>;
  const rawVis = (body.data as { visibility?: unknown }).visibility;
  if (rawVis !== undefined) update.visibility = normalizeVisibility(rawVis);
  const [row] = await db
    .update(savedReportViewsTable)
    .set(update)
    .where(eq(savedReportViewsTable.id, id))
    .returning();
  res.json(serialize(row, req.currentUser!.name, true));
});

router.delete("/saved-report-views/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db
    .select()
    .from(savedReportViewsTable)
    .where(eq(savedReportViewsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.userId !== req.currentUser!.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(savedReportViewsTable).where(eq(savedReportViewsTable.id, id));
  res.status(204).end();
});

export default router;
