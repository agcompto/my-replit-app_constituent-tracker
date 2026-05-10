import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, touchesTable, channelsTable, campaignTypesTable, touchAudienceDonorsTable, appSettingsTable } from "@workspace/db";
import {
  ListTouchesParams,
  CreateTouchParams,
  CreateTouchBody,
  UpdateTouchParams,
  UpdateTouchBody,
  DeleteTouchParams,
  UploadTouchAudienceParams,
  UploadTouchAudienceBody,
  ClearTouchAudienceParams,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { resolveAudienceSource } from "../lib/audienceSource";

const router: IRouter = Router();

async function shapeTouch(t: typeof touchesTable.$inferSelect) {
  const [ch] = await db.select().from(channelsTable).where(eq(channelsTable.id, t.channelId));
  const [tp] = await db
    .select()
    .from(campaignTypesTable)
    .where(eq(campaignTypesTable.id, t.campaignTypeId));
  return {
    id: t.id,
    campaignId: t.campaignId,
    touchName: t.touchName,
    channelId: t.channelId,
    channelLabel: ch?.name ?? "Unknown",
    campaignTypeId: t.campaignTypeId,
    campaignTypeLabel: tp?.name ?? "Unknown",
    sendDate: typeof t.sendDate === "string" ? t.sendDate : (t.sendDate as Date).toISOString().slice(0, 10),
    notes: t.notes,
    audienceMode: t.audienceMode,
    customValidIdCount: t.customValidIdCount,
    customUniqueIdCount: t.customUniqueIdCount,
    customDuplicateIdCount: t.customDuplicateIdCount,
    customRejectedIdCount: t.customRejectedIdCount,
    customOriginalRowCount: t.customOriginalRowCount,
    customExtraColumnsIgnored: t.customExtraColumnsIgnored,
    // Raw rejected/duplicate samples are never persisted (PII risk) — they're
    // only returned by the immediate upload response, not by this list/shape.
    customRejectedSamples: [] as string[],
    customDuplicateSamples: [] as string[],
  };
}

async function googleSheetImportAllowed(): Promise<boolean> {
  const [s] = await db.select().from(appSettingsTable);
  return !!s?.googleSheetImportEnabled;
}

router.get("/campaigns/:id/touches", requireAuth, async (req, res): Promise<void> => {
  const params = ListTouchesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(touchesTable)
    .where(eq(touchesTable.campaignId, params.data.id))
    .orderBy(touchesTable.sendDate);
  const shaped = await Promise.all(rows.map(shapeTouch));
  res.json(shaped);
});

router.post("/campaigns/:id/touches", requireAuth, async (req, res): Promise<void> => {
  const params = CreateTouchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateTouchBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
  const sendDateStr =
    body.data.sendDate instanceof Date
      ? body.data.sendDate.toISOString().slice(0, 10)
      : (body.data.sendDate as string);
  const [row] = await db
    .insert(touchesTable)
    .values({
      campaignId: params.data.id,
      touchName: body.data.touchName,
      channelId: body.data.channelId,
      campaignTypeId: body.data.campaignTypeId,
      sendDate: sendDateStr,
      notes: body.data.notes,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_touch",
    entityType: "touch",
    entityId: row.id,
    details: `Campaign ${params.data.id}: ${body.data.touchName}`,
  });
  res.status(201).json(await shapeTouch(row));
});

router.patch(
  "/campaigns/:id/touches/:touchId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateTouchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateTouchBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
    const updates: Record<string, unknown> = { ...body.data };
    if (updates.sendDate instanceof Date) {
      updates.sendDate = updates.sendDate.toISOString().slice(0, 10);
    }
    const [row] = await db
      .update(touchesTable)
      .set(updates)
      .where(
        and(
          eq(touchesTable.id, params.data.touchId),
          eq(touchesTable.campaignId, params.data.id),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "update_touch",
      entityType: "touch",
      entityId: row.id,
    });
    res.json(await shapeTouch(row));
  },
);

router.delete(
  "/campaigns/:id/touches/:touchId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteTouchParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
    await db
      .delete(touchesTable)
      .where(
        and(
          eq(touchesTable.id, params.data.touchId),
          eq(touchesTable.campaignId, params.data.id),
        ),
      );
    await audit({
      actor: req.currentUser!,
      action: "delete_touch",
      entityType: "touch",
      entityId: params.data.touchId,
    });
    res.status(204).end();
  },
);

// ───────── Per-touch audience overrides ─────────
router.post(
  "/campaigns/:id/touches/:touchId/audience",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UploadTouchAudienceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UploadTouchAudienceBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

    // Verify touch belongs to campaign
    const [touch] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!touch) { res.status(404).json({ error: "Touch not found" }); return; }

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

    await db.delete(touchAudienceDonorsTable).where(eq(touchAudienceDonorsTable.touchId, touch.id));
    if (result.validIds.length > 0) {
      const chunkSize = 1000;
      for (let i = 0; i < result.validIds.length; i += chunkSize) {
        const chunk = result.validIds.slice(i, i + chunkSize);
        await db.insert(touchAudienceDonorsTable).values(
          chunk.map((donorId) => ({ touchId: touch.id, donorId })),
        );
      }
    }
    await db
      .update(touchesTable)
      .set({
        audienceMode: "custom",
        customOriginalRowCount: result.originalRowCount,
        customValidIdCount: result.validIds.length,
        customUniqueIdCount: result.validIds.length,
        customDuplicateIdCount: result.duplicateIds.length,
        customRejectedIdCount: result.rejectedSamples.length,
        customExtraColumnsIgnored: result.extraColumnsIgnored,
        // Raw rejected/duplicate samples are intentionally NOT persisted (PII risk);
        // they are returned in this POST response only for one-time cleanup download.
      })
      .where(eq(touchesTable.id, touch.id));

    await audit({
      actor: req.currentUser!,
      action: "upload_touch_audience",
      entityType: "touch",
      entityId: touch.id,
      details: `source=${result.source} valid=${result.validIds.length} rejected=${result.rejectedSamples.length}`,
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
  },
);

router.delete(
  "/campaigns/:id/touches/:touchId/audience",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ClearTouchAudienceParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
    const [touch] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!touch) { res.status(404).json({ error: "Touch not found" }); return; }
    await db.delete(touchAudienceDonorsTable).where(eq(touchAudienceDonorsTable.touchId, touch.id));
    await db
      .update(touchesTable)
      .set({
        audienceMode: "campaign",
        customOriginalRowCount: 0,
        customValidIdCount: 0,
        customUniqueIdCount: 0,
        customDuplicateIdCount: 0,
        customRejectedIdCount: 0,
        customExtraColumnsIgnored: false,
      })
      .where(eq(touchesTable.id, touch.id));
    await audit({
      actor: req.currentUser!,
      action: "clear_touch_audience",
      entityType: "touch",
      entityId: touch.id,
    });
    res.status(204).end();
  },
);

export default router;
