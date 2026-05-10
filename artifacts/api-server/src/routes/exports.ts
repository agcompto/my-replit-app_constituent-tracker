import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, campaignsTable, touchpointsTable, exportJobsTable, usersTable } from "@workspace/db";
import {
  GetCampaignPreviewParams,
  FinalizeCampaignParams,
  ExportCampaignParams,
  GetCampaignExportManifestParams,
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
import { computeHealthCheck, snapshotHealthCheck } from "../lib/healthCheck";

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
  // Block export if the health check finds any errors; snapshot the result
  // either way so the audit record can show what was true at export time.
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
  const exportedAt = new Date();
  await snapshotHealthCheck(params.data.id, health, req.currentUser!.id);
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
    // Wrap donor IDs as Excel text-formula `="00012345"` so spreadsheet apps
    // preserve the 8-character zero-padding instead of coercing to a number
    // and stripping leading zeros. Safe to bypass the formula-injection guard
    // because donorId is server-validated to match /^[0-9]{1,8}$/.
    const lines = ["donor_id"];
    for (const r of rows) lines.push(`="${r.donorId}"`);
    // UTF-8 BOM so Excel auto-detects encoding
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csv);
  },
);

// Export manifest CSV: one row per file in the most recent export batch.
// Uses buildCsv (formula-injection safe) for all string cells. Numeric
// donor IDs are not part of the manifest, so the Excel text-formula trick
// is not needed here.
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
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    if (!campaign.exportedAt) {
      res.status(409).json({ error: "Campaign has not been exported yet." });
      return;
    }

    const { touchesTable, channelsTable, campaignTypesTable } = await import(
      "@workspace/db"
    );
    const jobs = await db
      .select({
        fileName: exportJobsTable.fileName,
        rowCount: exportJobsTable.rowCount,
        seedCount: exportJobsTable.seedCount,
        suppressedCount: exportJobsTable.suppressedCount,
        exportedAt: exportJobsTable.exportedAt,
        exportedByName: usersTable.name,
        touchName: touchesTable.touchName,
        sendDate: touchesTable.sendDate,
        channelLabel: channelsTable.name,
        campaignTypeLabel: campaignTypesTable.name,
      })
      .from(exportJobsTable)
      .leftJoin(touchesTable, eq(touchesTable.id, exportJobsTable.touchId))
      .leftJoin(channelsTable, eq(channelsTable.id, touchesTable.channelId))
      .leftJoin(
        campaignTypesTable,
        eq(campaignTypesTable.id, touchesTable.campaignTypeId),
      )
      .leftJoin(usersTable, eq(usersTable.id, exportJobsTable.exportedByUserId))
      .where(eq(exportJobsTable.campaignId, params.data.id))
      .orderBy(desc(exportJobsTable.exportedAt));

    // Filter to the most recent batch (same exportedAt as the campaign's exportedAt).
    const batchTs = campaign.exportedAt.getTime();
    const batch = jobs.filter(
      (j) => Math.abs(j.exportedAt.getTime() - batchTs) < 60_000,
    );

    const headers = [
      "file_name",
      "campaign_id",
      "campaign_name",
      "owning_unit",
      "touch_name",
      "channel",
      "campaign_type",
      "send_date",
      "row_count",
      "seed_count",
      "suppressed_count",
      "exported_by",
      "exported_at",
    ];
    const rows = batch.map((j) => [
      j.fileName,
      campaign.id,
      campaign.name,
      campaign.owningUnit,
      j.touchName,
      j.channelLabel,
      j.campaignTypeLabel,
      j.sendDate,
      j.rowCount,
      j.seedCount,
      j.suppressedCount,
      j.exportedByName ?? "",
      j.exportedAt.toISOString(),
    ]);
    const csv = "\uFEFF" + buildCsv(headers, rows);
    const safeName = campaign.name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || `campaign_${campaign.id}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}_export_manifest.csv"`,
    );
    res.send(csv);
  },
);

export default router;
