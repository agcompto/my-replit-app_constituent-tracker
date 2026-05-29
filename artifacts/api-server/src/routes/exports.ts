import { Router, type IRouter, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  campaignsTable,
  touchpointsTable,
  touchesTable,
  exportJobsTable,
} from "@workspace/db";
import {
  GetCampaignPreviewParams,
  FinalizeCampaignParams,
  ExportCampaignParams,
  GetCampaignExportManifestParams,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { checkExportQuota } from "../lib/rateLimit";
import {
  buildPerTouchExports,
  computeThresholdPreview,
  getCampaignTouchesForPreview,
  getEffectiveAudienceByTouch,
} from "../lib/threshold";
import { loadCampaignFull } from "../lib/campaigns";
import { computeHealthCheck, snapshotHealthCheck } from "../lib/healthCheck";
import { buildCampaignManifestCsv } from "../lib/campaignExports";

const router: IRouter = Router();

function setSensitiveDownloadHeaders(res: Response, fileName: string): void {
  const safeFileName = fileName.replace(/[\r\n"\\]/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

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
  if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
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
  if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
  const quota = checkExportQuota(req.currentUser!.id);
  if (!quota.allowed) {
    res
      .status(429)
      .setHeader("Retry-After", String(quota.retryAfterSec))
      .json({
        error: `Export quota reached. Try again in ${Math.ceil(quota.retryAfterSec / 60)} minutes.`,
        code: "export_quota_exceeded",
      });
    return;
  }
  const health = await computeHealthCheck(params.data.id);
  if (health.status === "error") {
    await snapshotHealthCheck(params.data.id, health, req.currentUser!.id);
    res.status(422).json({
      error: "Export blocked by campaign health check.",
      healthCheck: health,
    });
    return;
  }
  const perTouch = await buildPerTouchExports(params.data.id);
  if (perTouch.length === 0) {
    res.status(400).json({ error: "No touches to export" });
    return;
  }
  const MAX_EXPORT_ROWS = Math.max(
    1000,
    Number.parseInt(process.env.MAX_EXPORT_ROWS ?? "500000", 10) || 500_000,
  );
  const totalRows = perTouch.reduce((s, p) => s + p.totalRowsInExport, 0);
  if (totalRows > MAX_EXPORT_ROWS) {
    res.status(413).json({
      error: `This export would produce ${totalRows.toLocaleString()} rows, which exceeds the per-export cap of ${MAX_EXPORT_ROWS.toLocaleString()}. Split the audience or raise MAX_EXPORT_ROWS.`,
      code: "export_row_cap_exceeded",
      totalRows,
      maxRows: MAX_EXPORT_ROWS,
    });
    return;
  }
  const exportedAt = new Date();
  await snapshotHealthCheck(params.data.id, health, req.currentUser!.id);
  const touchRows = await db
    .select({
      id: touchesTable.id,
      channelId: touchesTable.channelId,
      campaignTypeId: touchesTable.campaignTypeId,
    })
    .from(touchesTable)
    .where(eq(touchesTable.campaignId, params.data.id));
  const touchById = new Map(touchRows.map((t) => [t.id, t]));
  for (const p of perTouch) {
    const t = touchById.get(p.touchId);
    if (!t) {
      res.status(500).json({ error: `Touch ${p.touchId} disappeared mid-export.` });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(touchpointsTable).where(eq(touchpointsTable.touchId, p.touchId));
      if (p.donorIds.length > 0 || p.seedDonorIds.length > 0) {
        const rows: (typeof touchpointsTable.$inferInsert)[] = [];
        for (const donorId of p.donorIds) {
          rows.push({
            campaignId: params.data.id,
            touchId: p.touchId,
            donorId,
            channelId: t.channelId,
            campaignTypeId: t.campaignTypeId,
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
            channelId: t.channelId,
            campaignTypeId: t.campaignTypeId,
            sendDate: p.sendDate,
            isSeed: true,
            countsTowardThreshold: false,
          });
        }
        const chunkSize = 1000;
        for (let i = 0; i < rows.length; i += chunkSize) {
          await tx.insert(touchpointsTable).values(rows.slice(i, i + chunkSize));
        }
      }
      await tx.insert(exportJobsTable).values({
        campaignId: params.data.id,
        touchId: p.touchId,
        fileName: p.fileName,
        rowCount: p.totalRowsInExport,
        seedCount: p.seedCount,
        suppressedCount: p.suppressedCount,
        exportedByUserId: req.currentUser!.id,
        exportedAt,
      });
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
    details: `${perTouch.length} touches exported; totalRows=${totalRows}`,
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
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
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
    const lines = ["donor_id"];
    for (const r of rows) lines.push(`="${r.donorId}"`);
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    await audit({
      actor: req.currentUser!,
      action: "download_export_csv",
      entityType: "campaign",
      entityId: id,
      details: `touchId=${touchId}; rowCount=${rows.length}`,
    });
    setSensitiveDownloadHeaders(res, fileName);
    res.send(csv);
  },
);

router.get(
  "/campaigns/:id/export-manifest.csv",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetCampaignExportManifestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot read manifest for a voided campaign" }); return; }

    const [campaign] = await db
      .select({ id: campaignsTable.id, exportedAt: campaignsTable.exportedAt })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    if (!campaign.exportedAt) {
      res.status(409).json({ error: "Campaign has not been exported yet." });
      return;
    }
    const built = await buildCampaignManifestCsv(params.data.id);
    if (!built) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "download_export_manifest",
      entityType: "campaign",
      entityId: params.data.id,
    });
    setSensitiveDownloadHeaders(res, built.filename);
    res.send(built.csv);
  },
);

export default router;
