import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, thresholdTemplatesTable, thresholdsTable } from "@workspace/db";
import {
  CreateThresholdTemplateBody,
  UpdateThresholdTemplateBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, audit, canMutateCampaign } from "../lib/auth";

const router: IRouter = Router();

function serialize(r: typeof thresholdTemplatesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    maxTouchpoints: r.maxTouchpoints,
    windowDays: r.windowDays,
    scope: r.scope,
    channelId: r.channelId,
    campaignTypeId: r.campaignTypeId,
    actionMode: r.actionMode,
    active: r.active,
    systemDefault: r.systemDefault,
    createdAt: r.createdAt.toISOString(),
  };
}

function validateScope(scope: string, channelId?: number | null, campaignTypeId?: number | null): string | null {
  if (scope === "channel" && !channelId) return "channelId is required when scope is 'channel'";
  if (scope === "campaign_type" && !campaignTypeId) return "campaignTypeId is required when scope is 'campaign_type'";
  if (scope === "channel_and_type" && (!channelId || !campaignTypeId))
    return "Both channelId and campaignTypeId are required when scope is 'channel_and_type'";
  return null;
}

// Any authenticated user can list templates (the wizard needs them)
router.get("/threshold-templates", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(thresholdTemplatesTable).orderBy(thresholdTemplatesTable.name);
  res.json(rows.map(serialize));
});

router.post(
  "/threshold-templates",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const body = CreateThresholdTemplateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const scopeErr = validateScope(body.data.scope, body.data.channelId, body.data.campaignTypeId);
    if (scopeErr) {
      res.status(400).json({ error: scopeErr });
      return;
    }
    const existing = await db
      .select({ id: thresholdTemplatesTable.id })
      .from(thresholdTemplatesTable)
      .where(eq(thresholdTemplatesTable.name, name));
    if (existing.length > 0) {
      res.status(409).json({ error: "A template with that name already exists." });
      return;
    }
    const [row] = await db
      .insert(thresholdTemplatesTable)
      .values({
        name,
        description: body.data.description ?? null,
        maxTouchpoints: body.data.maxTouchpoints,
        windowDays: body.data.windowDays,
        scope: body.data.scope,
        channelId: body.data.channelId ?? null,
        campaignTypeId: body.data.campaignTypeId ?? null,
        actionMode: body.data.actionMode,
        active: body.data.active ?? true,
        systemDefault: false,
      })
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "create_threshold_template",
      entityType: "threshold_template",
      entityId: row.id,
      details: name,
    });
    res.status(201).json(serialize(row));
  },
);

router.patch(
  "/threshold-templates/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = UpdateThresholdTemplateBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(thresholdTemplatesTable)
      .where(eq(thresholdTemplatesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.systemDefault) {
      // System templates: only super_admin may toggle active; rename forbidden.
      if (body.data.name !== undefined && body.data.name.trim() !== existing.name) {
        res.status(403).json({ error: "System templates cannot be renamed." });
        return;
      }
      const onlyActiveChange =
        Object.keys(body.data).length === 1 && body.data.active !== undefined;
      if (!onlyActiveChange && req.currentUser!.role !== "super_admin") {
        res.status(403).json({ error: "Only a super admin can edit a system template." });
        return;
      }
      if (body.data.active !== undefined && req.currentUser!.role !== "super_admin") {
        res.status(403).json({ error: "Only a super admin can deactivate a system template." });
        return;
      }
    }
    const update: Partial<typeof thresholdTemplatesTable.$inferInsert> = {};
    if (body.data.name !== undefined) update.name = body.data.name.trim();
    if (body.data.description !== undefined) update.description = body.data.description;
    if (body.data.maxTouchpoints !== undefined) update.maxTouchpoints = body.data.maxTouchpoints;
    if (body.data.windowDays !== undefined) update.windowDays = body.data.windowDays;
    if (body.data.scope !== undefined) update.scope = body.data.scope;
    if (body.data.channelId !== undefined) update.channelId = body.data.channelId;
    if (body.data.campaignTypeId !== undefined) update.campaignTypeId = body.data.campaignTypeId;
    if (body.data.actionMode !== undefined) update.actionMode = body.data.actionMode;
    if (body.data.active !== undefined) update.active = body.data.active;

    const merged = { ...existing, ...update };
    const scopeErr = validateScope(merged.scope, merged.channelId, merged.campaignTypeId);
    if (scopeErr) {
      res.status(400).json({ error: scopeErr });
      return;
    }
    const [row] = await db
      .update(thresholdTemplatesTable)
      .set(update)
      .where(eq(thresholdTemplatesTable.id, id))
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "update_threshold_template",
      entityType: "threshold_template",
      entityId: row.id,
    });
    res.json(serialize(row));
  },
);

router.delete(
  "/threshold-templates/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(thresholdTemplatesTable)
      .where(eq(thresholdTemplatesTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.systemDefault) {
      res.status(403).json({ error: "System templates cannot be deleted; deactivate them instead." });
      return;
    }
    await db.delete(thresholdTemplatesTable).where(eq(thresholdTemplatesTable.id, id));
    await audit({
      actor: req.currentUser!,
      action: "delete_threshold_template",
      entityType: "threshold_template",
      entityId: id,
      details: existing.name,
    });
    res.status(204).end();
  },
);

// Apply: copy active templates into the campaign's thresholds.
// Idempotent: skip any template whose name already exists as a threshold on the campaign.
router.post(
  "/campaigns/:id/apply-threshold-templates",
  requireAuth,
  async (req, res): Promise<void> => {
    const campaignId = Number(req.params.id);
    if (!Number.isFinite(campaignId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const access = await canMutateCampaign(campaignId, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

    const templates = await db
      .select()
      .from(thresholdTemplatesTable)
      .where(eq(thresholdTemplatesTable.active, true));

    const existing = await db
      .select({ name: thresholdsTable.name })
      .from(thresholdsTable)
      .where(eq(thresholdsTable.campaignId, campaignId));
    const existingNames = new Set(existing.map((r) => r.name));

    const toInsert = templates.filter((t) => !existingNames.has(t.name));
    const skippedNames = templates.filter((t) => existingNames.has(t.name)).map((t) => t.name);

    if (toInsert.length > 0) {
      await db.insert(thresholdsTable).values(
        toInsert.map((t) => ({
          campaignId,
          name: t.name,
          maxTouchpoints: t.maxTouchpoints,
          windowDays: t.windowDays,
          scope: t.scope,
          channelId: t.channelId,
          campaignTypeId: t.campaignTypeId,
          actionMode: t.actionMode,
        })),
      );
    }

    await audit({
      actor: req.currentUser!,
      action: "apply_threshold_templates",
      entityType: "campaign",
      entityId: campaignId,
      details: `created=${toInsert.length} skipped=${skippedNames.length}`,
    });

    res.json({
      created: toInsert.length,
      skipped: skippedNames.length,
      total: templates.length,
      skippedNames,
    });
  },
);

// Suppress unused warning
void and;
void inArray;

export default router;
