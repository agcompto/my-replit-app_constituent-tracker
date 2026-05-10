import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, suppressionsTable, suppressionReasonCodesTable } from "@workspace/db";
import {
  ListSuppressionsParams,
  CreateSuppressionParams,
  CreateSuppressionBody,
  DeleteSuppressionParams,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { parseDonorIdInput } from "../lib/donor";

const router: IRouter = Router();

router.get("/campaigns/:id/suppressions", requireAuth, async (req, res): Promise<void> => {
  const params = ListSuppressionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select({
      id: suppressionsTable.id,
      campaignId: suppressionsTable.campaignId,
      scope: suppressionsTable.scope,
      channelId: suppressionsTable.channelId,
      campaignTypeId: suppressionsTable.campaignTypeId,
      touchId: suppressionsTable.touchId,
      reasonCodeId: suppressionsTable.reasonCodeId,
      reasonCodeName: suppressionReasonCodesTable.name,
      reason: suppressionsTable.reason,
      notes: suppressionsTable.notes,
      donorIds: suppressionsTable.donorIds,
      createdAt: suppressionsTable.createdAt,
    })
    .from(suppressionsTable)
    .leftJoin(
      suppressionReasonCodesTable,
      eq(suppressionReasonCodesTable.id, suppressionsTable.reasonCodeId),
    )
    .where(eq(suppressionsTable.campaignId, params.data.id))
    .orderBy(suppressionsTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      scope: r.scope,
      channelId: r.channelId,
      campaignTypeId: r.campaignTypeId,
      touchId: r.touchId,
      reasonCodeId: r.reasonCodeId,
      reasonCodeName: r.reasonCodeName,
      reason: r.reason,
      notes: r.notes,
      donorIdCount: (r.donorIds ?? []).length,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/campaigns/:id/suppressions", requireAuth, async (req, res): Promise<void> => {
  const params = CreateSuppressionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateSuppressionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

  let reasonCodeId: number | null = null;
  let reasonCodeName: string | null = null;
  if (body.data.reasonCodeId != null) {
    const [rc] = await db
      .select({ id: suppressionReasonCodesTable.id, name: suppressionReasonCodesTable.name, active: suppressionReasonCodesTable.active })
      .from(suppressionReasonCodesTable)
      .where(eq(suppressionReasonCodesTable.id, body.data.reasonCodeId));
    if (!rc) {
      res.status(400).json({ error: "Invalid reason code" });
      return;
    }
    if (!rc.active) {
      res.status(400).json({ error: "That reason code has been deactivated. Please pick another." });
      return;
    }
    reasonCodeId = rc.id;
    reasonCodeName = rc.name;
  }

  const raw = body.data.rawText ?? "";
  const parsed = parseDonorIdInput(raw);
  const [row] = await db
    .insert(suppressionsTable)
    .values({
      campaignId: params.data.id,
      scope: body.data.scope,
      channelId: body.data.channelId ?? null,
      campaignTypeId: body.data.campaignTypeId ?? null,
      touchId: body.data.touchId ?? null,
      reasonCodeId,
      reason: body.data.reason,
      notes: body.data.notes,
      donorIds: parsed.validIds,
      createdByUserId: req.currentUser!.id,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_suppression",
    entityType: "suppression",
    entityId: row.id,
    details: `Campaign ${params.data.id} scope=${body.data.scope} count=${parsed.validIds.length}${reasonCodeName ? ` reason=${reasonCodeName}` : ""}`,
  });
  res.status(201).json({
    id: row.id,
    campaignId: row.campaignId,
    scope: row.scope,
    channelId: row.channelId,
    campaignTypeId: row.campaignTypeId,
    touchId: row.touchId,
    reasonCodeId: row.reasonCodeId,
    reasonCodeName,
    reason: row.reason,
    notes: row.notes,
    donorIdCount: parsed.validIds.length,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete(
  "/campaigns/:id/suppressions/:suppressionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteSuppressionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
    await db
      .delete(suppressionsTable)
      .where(
        and(
          eq(suppressionsTable.id, params.data.suppressionId),
          eq(suppressionsTable.campaignId, params.data.id),
        ),
      );
    await audit({
      actor: req.currentUser!,
      action: "delete_suppression",
      entityType: "suppression",
      entityId: params.data.suppressionId,
    });
    res.status(204).end();
  },
);

export default router;
