import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, seedGroupsTable } from "@workspace/db";
import {
  ListSeedsParams,
  CreateSeedGroupParams,
  CreateSeedGroupBody,
  DeleteSeedGroupParams,
} from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";
import { parseDonorIdInput } from "../lib/donor";

const router: IRouter = Router();

router.get("/campaigns/:id/seeds", requireAuth, async (req, res): Promise<void> => {
  const params = ListSeedsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(seedGroupsTable)
    .where(eq(seedGroupsTable.campaignId, params.data.id))
    .orderBy(seedGroupsTable.createdAt);
  res.json(
    rows.map((r) => ({
      id: r.id,
      campaignId: r.campaignId,
      scope: r.scope,
      channelId: r.channelId,
      touchId: r.touchId,
      seedCount: (r.donorIds ?? []).length,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/campaigns/:id/seeds", requireAuth, async (req, res): Promise<void> => {
  const params = CreateSeedGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CreateSeedGroupBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const parsed = parseDonorIdInput(body.data.rawText ?? "");
  const [row] = await db
    .insert(seedGroupsTable)
    .values({
      campaignId: params.data.id,
      scope: body.data.scope,
      channelId: body.data.channelId ?? null,
      touchId: body.data.touchId ?? null,
      donorIds: parsed.validIds,
      createdByUserId: req.currentUser!.id,
    })
    .returning();
  await audit({
    actor: req.currentUser!,
    action: "create_seed_group",
    entityType: "seed_group",
    entityId: row.id,
    details: `Campaign ${params.data.id} scope=${body.data.scope} count=${parsed.validIds.length}`,
  });
  res.status(201).json({
    id: row.id,
    campaignId: row.campaignId,
    scope: row.scope,
    channelId: row.channelId,
    touchId: row.touchId,
    seedCount: parsed.validIds.length,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete(
  "/campaigns/:id/seeds/:seedId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteSeedGroupParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    await db
      .delete(seedGroupsTable)
      .where(
        and(
          eq(seedGroupsTable.id, params.data.seedId),
          eq(seedGroupsTable.campaignId, params.data.id),
        ),
      );
    await audit({
      actor: req.currentUser!,
      action: "delete_seed_group",
      entityType: "seed_group",
      entityId: params.data.seedId,
    });
    res.status(204).end();
  },
);

export default router;
