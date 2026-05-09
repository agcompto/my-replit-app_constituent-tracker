import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, thresholdsTable, thresholdOverridesTable } from "@workspace/db";
import {
  ListThresholdsParams,
  CreateThresholdParams,
  CreateThresholdBody,
  DeleteThresholdParams,
  PreviewThresholdsParams,
  SetThresholdOverridesParams,
  SetThresholdOverridesBody,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { computeThresholdPreview } from "../lib/threshold";

const router: IRouter = Router();

router.get("/campaigns/:id/thresholds", requireAuth, async (req, res): Promise<void> => {
  const params = ListThresholdsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(thresholdsTable)
    .where(eq(thresholdsTable.campaignId, params.data.id));
  res.json(rows);
});

router.post("/campaigns/:id/thresholds", requireAuth, async (req, res): Promise<void> => {
  const params = CreateThresholdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateThresholdBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
  const [row] = await db
    .insert(thresholdsTable)
    .values({
      campaignId: params.data.id,
      name: body.data.name,
      maxTouchpoints: body.data.maxTouchpoints,
      windowDays: body.data.windowDays,
      scope: body.data.scope,
      channelId: body.data.channelId ?? null,
      campaignTypeId: body.data.campaignTypeId ?? null,
      actionMode: body.data.actionMode,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_threshold",
    entityType: "threshold",
    entityId: row.id,
  });
  res.status(201).json(row);
});

router.delete(
  "/campaigns/:id/thresholds/:thresholdId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteThresholdParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    await db
      .delete(thresholdsTable)
      .where(
        and(
          eq(thresholdsTable.id, params.data.thresholdId),
          eq(thresholdsTable.campaignId, params.data.id),
        ),
      );
    await audit({
      actor: req.currentUser!,
      action: "delete_threshold",
      entityType: "threshold",
      entityId: params.data.thresholdId,
    });
    res.status(204).end();
  },
);

router.post(
  "/campaigns/:id/threshold-preview",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = PreviewThresholdsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await computeThresholdPreview(params.data.id);
    res.json(result);
  },
);

router.post(
  "/campaigns/:id/threshold-overrides",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SetThresholdOverridesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SetThresholdOverridesBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    await db
      .delete(thresholdOverridesTable)
      .where(eq(thresholdOverridesTable.campaignId, params.data.id));
    if (body.data.donorIds.length > 0) {
      await db
        .insert(thresholdOverridesTable)
        .values(body.data.donorIds.map((d) => ({ campaignId: params.data.id, donorId: d })));
    }
    await audit({
      actor: req.currentUser!,
      action: "set_overrides",
      entityType: "campaign",
      entityId: params.data.id,
      details: `count=${body.data.donorIds.length}`,
    });
    res.status(204).end();
  },
);

export default router;
