import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, campaignsTable, touchpointsTable, exportJobsTable } from "@workspace/db";
import {
  GetCampaignPreviewParams,
  FinalizeCampaignParams,
  ExportCampaignParams,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import {
  buildPerTouchExports,
  computeThresholdPreview,
  getCampaignTouchesForPreview,
  getEffectiveAudienceByTouch,
} from "../lib/threshold";
import { loadCampaignFull } from "../lib/campaigns";
import { buildCsv } from "../lib/donor";

const router: IRouter = Router();

router.get("/campaigns/:id/preview", requireAuth, async (req, res): Promise<void> => {
  const params = GetCampaignPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [perTouch, preview, planned] = await Promise.all([
    buildPerTouchExports(params.data.id),
    computeThresholdPreview(params.data.id),
    getCampaignTouchesForPreview(params.data.id),
  ]);
  const audienceByTouch = await getEffectiveAudienceByTouch(params.data.id, planned);
  const uniqueDonors = new Set<string>();
  for (const set of audienceByTouch.values()) {
    for (const d of set) uniqueDonors.add(d);
  }
  const audienceUnique = uniqueDonors.size;
  const totalSeedIds = perTouch.reduce((sum, p) => sum + p.seedCount, 0);
  const totalBefore = perTouch.reduce((s, p) => s + (p.eligibleCount + p.suppressedCount), 0);
  const totalAfter = perTouch.reduce((s, p) => s + p.eligibleCount, 0);
  const manuallySuppressed = totalBefore - totalAfter - preview.totalFlaggedDonors;
  res.json({
    campaignId: params.data.id,
    audienceUnique,
    thresholdFlaggedDonors: preview.totalFlaggedDonors,
    manuallySuppressedDonors: Math.max(0, manuallySuppressed),
    totalSeedIds,
    totalPlannedTouchpointsBefore: totalBefore,
    totalPlannedTouchpointsAfter: totalAfter,
    perTouch: perTouch.map((p) => ({
      touchId: p.touchId,
      touchName: p.touchName,
      channelLabel: p.channelLabel,
      campaignTypeLabel: p.campaignTypeLabel,
      sendDate: p.sendDate,
      eligibleCount: p.eligibleCount,
      suppressedCount: p.suppressedCount,
      seedCount: p.seedCount,
      totalRowsInExport: p.totalRowsInExport,
      fileName: p.fileName,
    })),
  });
});

router.post("/campaigns/:id/finalize", requireAuth, async (req, res): Promise<void> => {
  const params = FinalizeCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
  await db
    .update(campaignsTable)
    .set({ status: "finalized" })
    .where(eq(campaignsTable.id, params.data.id));
  await audit({
    actor: req.currentUser!,
    action: "finalize_campaign",
    entityType: "campaign",
    entityId: params.data.id,
  });
  res.json(await loadCampaignFull(params.data.id));
});

router.post("/campaigns/:id/export", requireAuth, async (req, res): Promise<void> => {
  const params = ExportCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
  const perTouch = await buildPerTouchExports(params.data.id);
  if (perTouch.length === 0) {
    res.status(400).json({ error: "No touches to export" });
    return;
  }
  const exportedAt = new Date();
  // Save touchpoints to history + record export jobs
  for (const p of perTouch) {
    // Clear any prior records for this touch (idempotent re-export)
    await db.delete(touchpointsTable).where(eq(touchpointsTable.touchId, p.touchId));
    if (p.donorIds.length > 0 || p.seedDonorIds.length > 0) {
      const rows: (typeof touchpointsTable.$inferInsert)[] = [];
      const ch = await db
        .select()
        .from(campaignsTable)
        .where(eq(campaignsTable.id, params.data.id));
      void ch;
      for (const donorId of p.donorIds) {
        rows.push({
          campaignId: params.data.id,
          touchId: p.touchId,
          donorId,
          channelId: 0, // will be filled below
          campaignTypeId: 0,
          sendDate: p.sendDate,
          isSeed: false,
          countsTowardThreshold: true,
        });
      }
      for (const donorId of p.seedDonorIds) {
        rows.push({
          campaignId: params.data.id,
          touchId: p.touchId,
          donorId,
          channelId: 0,
          campaignTypeId: 0,
          sendDate: p.sendDate,
          isSeed: true,
          countsTowardThreshold: false,
        });
      }
      // We need channelId/campaignTypeId per-touch; fetch from touches
      const { touchesTable } = await import("@workspace/db");
      const [t] = await db
        .select()
        .from(touchesTable)
        .where(eq(touchesTable.id, p.touchId));
      if (t) {
        for (const r of rows) {
          r.channelId = t.channelId;
          r.campaignTypeId = t.campaignTypeId;
        }
      }
      // Bulk insert in chunks
      const chunkSize = 1000;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await db.insert(touchpointsTable).values(rows.slice(i, i + chunkSize));
      }
    }
    await db.insert(exportJobsTable).values({
      campaignId: params.data.id,
      touchId: p.touchId,
      fileName: p.fileName,
      rowCount: p.totalRowsInExport,
      seedCount: p.seedCount,
      suppressedCount: p.suppressedCount,
      exportedByUserId: req.currentUser!.id,
      exportedAt,
    });
  }
  await db
    .update(campaignsTable)
    .set({ status: "exported", exportedAt })
    .where(eq(campaignsTable.id, params.data.id));
  await audit({
    actor: req.currentUser!,
    action: "export_campaign",
    entityType: "campaign",
    entityId: params.data.id,
    details: `${perTouch.length} touches exported`,
  });
  res.json({
    campaignId: params.data.id,
    status: "exported",
    exportedAt: exportedAt.toISOString(),
    files: perTouch.map((p) => ({
      touchId: p.touchId,
      fileName: p.fileName,
      rowCount: p.totalRowsInExport,
      seedCount: p.seedCount,
      suppressedCount: p.suppressedCount,
      downloadUrl: `/api/campaigns/${params.data.id}/exports/${p.touchId}.csv`,
    })),
  });
});

router.get(
  "/campaigns/:id/exports/:touchId.csv",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
    const touchId = parseInt(
      Array.isArray(req.params.touchId) ? req.params.touchId[0] : req.params.touchId,
      10,
    );
    if (Number.isNaN(id) || Number.isNaN(touchId)) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const access = await canMutateCampaign(id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db
      .select({ donorId: touchpointsTable.donorId, isSeed: touchpointsTable.isSeed })
      .from(touchpointsTable)
      .where(and(eq(touchpointsTable.campaignId, id), eq(touchpointsTable.touchId, touchId)));
    rows.sort((a, b) => {
      if (a.isSeed === b.isSeed) return a.donorId.localeCompare(b.donorId);
      return a.isSeed ? 1 : -1;
    });
    const [job] = await db
      .select()
      .from(exportJobsTable)
      .where(and(eq(exportJobsTable.campaignId, id), eq(exportJobsTable.touchId, touchId)))
      .orderBy(exportJobsTable.exportedAt);
    const fileName = job?.fileName ?? `campaign_${id}_touch_${touchId}.csv`;
    const csv = buildCsv(["donor_id"], rows.map((r) => [r.donorId]));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  },
);

export default router;
