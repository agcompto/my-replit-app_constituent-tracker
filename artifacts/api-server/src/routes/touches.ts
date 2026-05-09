import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, touchesTable, channelsTable, campaignTypesTable } from "@workspace/db";
import {
  ListTouchesParams,
  CreateTouchParams,
  CreateTouchBody,
  UpdateTouchParams,
  UpdateTouchBody,
  DeleteTouchParams,
} from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";

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
  };
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

export default router;
