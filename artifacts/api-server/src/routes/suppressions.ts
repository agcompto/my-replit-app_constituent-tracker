import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, suppressionsTable } from "@workspace/db";
import {
  ListSuppressionsParams,
  CreateSuppressionParams,
  CreateSuppressionBody,
  DeleteSuppressionParams,
} from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";
import { parseDonorIdInput } from "../lib/donor";

const router: IRouter = Router();

router.get("/campaigns/:id/suppressions", requireAuth, async (req, res): Promise<void> => {
  const params = ListSuppressionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(suppressionsTable)
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
    details: `Campaign ${params.data.id} scope=${body.data.scope} count=${parsed.validIds.length}`,
  });
  res.status(201).json({
    id: row.id,
    campaignId: row.campaignId,
    scope: row.scope,
    channelId: row.channelId,
    campaignTypeId: row.campaignTypeId,
    touchId: row.touchId,
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
