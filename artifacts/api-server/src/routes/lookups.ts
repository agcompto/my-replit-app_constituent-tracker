import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, campaignTypesTable, channelsTable, owningUnitsTable } from "@workspace/db";
import {
  CreateCampaignTypeBody,
  UpdateCampaignTypeParams,
  UpdateCampaignTypeBody,
  CreateChannelBody,
  UpdateChannelParams,
  UpdateChannelBody,
  CreateOwningUnitBody,
  UpdateOwningUnitParams,
  UpdateOwningUnitBody,
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
    const [existing] = await db
      .select()
      .from(campaignTypesTable)
      .where(eq(campaignTypesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.systemDefault && req.currentUser!.role !== "super_admin") {
      res.status(403).json({ error: "Only a super admin can modify a system default item" });
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
    const [existing] = await db
      .select()
      .from(channelsTable)
      .where(eq(channelsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.systemDefault && req.currentUser!.role !== "super_admin") {
      res.status(403).json({ error: "Only a super admin can modify a system default item" });
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

// ─── Owning units ───
router.get("/owning-units", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select().from(owningUnitsTable).orderBy(owningUnitsTable.name);
  res.json(rows);
});

router.post("/owning-units", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = CreateOwningUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db
      .insert(owningUnitsTable)
      .values({ name: parsed.data.name, description: parsed.data.description })
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "create_owning_unit",
      entityType: "owning_unit",
      entityId: row.id,
    });
    res.status(201).json(row);
  } catch {
    res.status(409).json({ error: "Name already exists" });
  }
});

router.patch(
  "/owning-units/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateOwningUnitParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateOwningUnitBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(owningUnitsTable)
      .where(eq(owningUnitsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.systemDefault && req.currentUser!.role !== "super_admin") {
      res.status(403).json({ error: "Only a super admin can modify a system default item" });
      return;
    }
    const [row] = await db
      .update(owningUnitsTable)
      .set(body.data)
      .where(eq(owningUnitsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "update_owning_unit",
      entityType: "owning_unit",
      entityId: row.id,
    });
    res.json(row);
  },
);

export default router;
