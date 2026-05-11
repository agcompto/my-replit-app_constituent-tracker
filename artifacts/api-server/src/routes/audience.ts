import express, { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, audienceDonorsTable, campaignsTable, uploadJobsTable, appSettingsTable } from "@workspace/db";
import { UploadAudienceParams, UploadAudienceBody, GetAudienceSummaryParams } from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { resolveAudienceSource } from "../lib/audienceSource";

async function googleSheetImportAllowed(): Promise<boolean> {
  const [s] = await db.select().from(appSettingsTable);
  return !!s?.googleSheetImportEnabled;
}

const router: IRouter = Router();

// Audience uploads accept large pasted CSVs / Google Sheet exports — allow
// up to 20 MB on this route only. The global app-wide JSON limit is 256 kb.
const audienceUploadParser = express.json({ limit: "20mb" });

router.post("/campaigns/:id/audience", requireAuth, audienceUploadParser, async (req, res): Promise<void> => {
  const params = UploadAudienceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UploadAudienceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

  if (body.data.googleSheetUrl && !(await googleSheetImportAllowed())) {
    res.status(403).json({ error: "Google Sheet import is disabled by an administrator." });
    return;
  }

  let result;
  try {
    result = await resolveAudienceSource({
      rawText: body.data.rawText,
      googleSheetUrl: body.data.googleSheetUrl,
      csvFileBase64: body.data.csvFileBase64,
      hasHeader: body.data.hasHeader,
      columnIndex: body.data.columnIndex,
    });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Could not parse audience input." });
    return;
  }

  // Replace audience
  await db.delete(audienceDonorsTable).where(eq(audienceDonorsTable.campaignId, params.data.id));
  if (result.validIds.length > 0) {
    const chunkSize = 1000;
    for (let i = 0; i < result.validIds.length; i += chunkSize) {
      const chunk = result.validIds.slice(i, i + chunkSize);
      await db.insert(audienceDonorsTable).values(
        chunk.map((donorId) => ({ campaignId: params.data.id, donorId })),
      );
    }
  }
  await db
    .update(campaignsTable)
    .set({
      status: "uploaded",
      originalRowCount: result.originalRowCount,
      blankRowCount: result.blankRowCount,
      validIdCount: result.validIds.length,
      uniqueIdCount: result.validIds.length,
      duplicateIdCount: result.duplicateIds.length,
      rejectedIdCount: result.rejectedSamples.length,
      extraColumnsIgnored: result.extraColumnsIgnored,
      // Note: raw rejected/duplicate samples are intentionally NOT persisted —
      // they may contain PII (names/emails/phones) from CSV/Sheet uploads.
      // Only counts are stored; samples are returned in this POST response only
      // so the uploader can download them once for cleanup.
    })
    .where(eq(campaignsTable.id, params.data.id));

  await db.insert(uploadJobsTable).values({
    campaignId: params.data.id,
    source: result.source,
    validCount: result.validIds.length,
    rejectedCount: result.rejectedSamples.length,
    uploadedByUserId: req.currentUser!.id,
  });

  await audit({
    actor: req.currentUser!,
    action: "upload_audience",
    entityType: "campaign",
    entityId: params.data.id,
    details: `source=${result.source} valid=${result.validIds.length} rejected=${result.rejectedSamples.length} duplicates=${result.duplicateIds.length}`,
  });

  res.json({
    originalRowCount: result.originalRowCount,
    blankRowCount: result.blankRowCount,
    validCount: result.validIds.length,
    uniqueCount: result.validIds.length,
    duplicateCount: result.duplicateIds.length,
    rejectedCount: result.rejectedSamples.length,
    extraColumnsIgnored: result.extraColumnsIgnored,
    detectedColumns: result.detectedColumns,
    rejectedSamples: result.rejectedSamples,
    duplicateSamples: result.duplicateSamples,
  });
});

router.get("/campaigns/:id/audience", requireAuth, async (req, res): Promise<void> => {
  const params = GetAudienceSummaryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [c] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, params.data.id));
  if (!c) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({
    originalRowCount: c.originalRowCount,
    blankRowCount: c.blankRowCount,
    validCount: c.validIdCount,
    uniqueCount: c.uniqueIdCount,
    duplicateCount: c.duplicateIdCount,
    rejectedCount: c.rejectedIdCount,
    extraColumnsIgnored: c.extraColumnsIgnored,
    detectedColumns: [],
    // Samples are intentionally not persisted (may contain PII from uploads).
    rejectedSamples: [],
    duplicateSamples: [],
  });
});

export default router;
