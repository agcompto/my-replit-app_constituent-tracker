import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, campaignTypesTable, channelsTable } from "@workspace/db";
import {
  CreateCampaignTypeBody,
  UpdateCampaignTypeParams,
  UpdateCampaignTypeBody,
  CreateChannelBody,
  UpdateChannelParams,
  UpdateChannelBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, audit } from "../lib/auth";

const router: IRouter = Router();

// ─── Campaign types ───
router.get("/campaign-types", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(campaignTypesTable).orderBy(campaignTypesTable.name);
  res.json(rows);
});

router.post(
  "/campaign-types",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateCampaignTypeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const [row] = await db
        .insert(campaignTypesTable)
        .values({ name: parsed.data.name, description: parsed.data.description })
        .returning();
      await audit({
        actor: req.currentUser!,
        action: "create_campaign_type",
        entityType: "campaign_type",
        entityId: row.id,
      });
      res.status(201).json(row);
    } catch {
      res.status(409).json({ error: "Name already exists" });
    }
  },
);

router.patch(
  "/campaign-types/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateCampaignTypeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateCampaignTypeBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(campaignTypesTable)
      .set(body.data)
      .where(eq(campaignTypesTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "update_campaign_type",
      entityType: "campaign_type",
      entityId: row.id,
    });
    res.json(row);
  },
);

// ─── Channels ───
router.get("/channels", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(channelsTable).orderBy(channelsTable.name);
  res.json(rows);
});

router.post("/channels", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db
      .insert(channelsTable)
      .values({ name: parsed.data.name, description: parsed.data.description })
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "create_channel",
      entityType: "channel",
      entityId: row.id,
    });
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: "Name already exists" });
  }
});

router.patch(
  "/channels/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateChannelParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateChannelBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(channelsTable)
      .set(body.data)
      .where(eq(channelsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "update_channel",
      entityType: "channel",
      entityId: row.id,
    });
    res.json(row);
  },
);

export default router;
