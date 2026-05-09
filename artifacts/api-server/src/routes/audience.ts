import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, audienceDonorsTable, campaignsTable, uploadJobsTable } from "@workspace/db";
import { UploadAudienceParams, UploadAudienceBody, GetAudienceSummaryParams } from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";
import { parseDonorIdInput } from "../lib/donor";

const router: IRouter = Router();

router.post("/campaigns/:id/audience", requireAuth, async (req, res): Promise<void> => {
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
  const raw = body.data.rawText;
  if (!raw || !raw.trim()) {
    res.status(400).json({ error: "Provide rawText with donor IDs (Google Sheet imports require server enablement)." });
    return;
  }
  const result = parseDonorIdInput(raw, {
    hasHeader: body.data.hasHeader,
    columnIndex: body.data.columnIndex,
  });
  // Replace audience
  await db.delete(audienceDonorsTable).where(eq(audienceDonorsTable.campaignId, params.data.id));
  if (result.validIds.length > 0) {
    // Insert in chunks
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
      rejectedSamples: result.rejectedSamples,
      duplicateSamples: result.duplicateSamples,
    })
    .where(eq(campaignsTable.id, params.data.id));

  await db.insert(uploadJobsTable).values({
    campaignId: params.data.id,
    source: "paste",
    validCount: result.validIds.length,
    rejectedCount: result.rejectedSamples.length,
    uploadedByUserId: req.currentUser!.id,
  });

  await audit({
    actor: req.currentUser!,
    action: "upload_audience",
    entityType: "campaign",
    entityId: params.data.id,
    details: `valid=${result.validIds.length} rejected=${result.rejectedSamples.length} duplicates=${result.duplicateIds.length}`,
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
    rejectedSamples: c.rejectedSamples ?? [],
    duplicateSamples: c.duplicateSamples ?? [],
  });
});

export default router;
