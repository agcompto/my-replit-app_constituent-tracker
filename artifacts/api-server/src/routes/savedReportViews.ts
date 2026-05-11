import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, savedReportViewsTable } from "@workspace/db";
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
]);

function serialize(r: typeof savedReportViewsTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    viewType: r.viewType,
    filters: r.filtersJson ?? {},
    config: r.configJson ?? {},
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/saved-report-views", requireAuth, async (req, res): Promise<void> => {
  const userId = req.currentUser!.id;
  const viewType = typeof req.query.viewType === "string" ? req.query.viewType : undefined;
  const conds = [eq(savedReportViewsTable.userId, userId)];
  if (viewType) conds.push(eq(savedReportViewsTable.viewType, viewType));
  const rows = await db
    .select()
    .from(savedReportViewsTable)
    .where(conds.length === 1 ? conds[0] : and(...conds))
    .orderBy(savedReportViewsTable.name);
  res.json(rows.map(serialize));
});

router.post("/saved-report-views", requireAuth, async (req, res): Promise<void> => {
  const body = CreateSavedReportViewBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!ALLOWED_VIEW_TYPES.has(body.data.viewType)) {
    res.status(400).json({ error: "Unknown viewType" });
    return;
  }
  const [row] = await db
    .insert(savedReportViewsTable)
    .values({
      userId: req.currentUser!.id,
      name: body.data.name.trim(),
      viewType: body.data.viewType,
      filtersJson: (body.data.filters ?? {}) as Record<string, unknown>,
      configJson: (body.data.config ?? {}) as Record<string, unknown>,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_saved_report_view",
    entityType: "saved_report_view",
    entityId: row.id,
    details: `${row.viewType}: ${row.name}`,
  });
  res.status(201).json(serialize(row));
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
  const [row] = await db
    .update(savedReportViewsTable)
    .set(update)
    .where(eq(savedReportViewsTable.id, id))
    .returning();
  res.json(serialize(row));
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
