import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, campaignsTable, campaignTypeLinksTable, campaignTypesTable, owningUnitsTable, usersTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  ArchiveCampaignParams,
  VoidCampaignParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, audit, canMutateCampaign } from "../lib/auth";
import { loadCampaignFull, loadCampaignSummary, setCampaignTypes } from "../lib/campaigns";

const router: IRouter = Router();

router.get("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const conditions = [];
  const mine = req.query.mine === "true";
  if (mine) {
    conditions.push(eq(campaignsTable.submittedByUserId, req.currentUser!.id));
  }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status) conditions.push(eq(campaignsTable.status, status));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    conditions.push(
      or(
        ilike(campaignsTable.name, `%${q}%`),
        ilike(campaignsTable.owningUnit, `%${q}%`),
        ilike(campaignsTable.salesforceCampaignId, `%${q}%`),
      )!,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(where)
    .orderBy(desc(campaignsTable.createdAt))
    .limit(500);
  const summaries = await Promise.all(rows.map((r) => loadCampaignSummary(r.id)));
  res.json(summaries.filter(Boolean));
});

router.post("/campaigns", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { campaignTypeIds, ...fields } = parsed.data;
  if (fields.owningUnit) {
    const [u] = await db
      .select({ id: owningUnitsTable.id })
      .from(owningUnitsTable)
      .where(and(eq(owningUnitsTable.name, fields.owningUnit), eq(owningUnitsTable.active, true)));
    if (!u) {
      res.status(400).json({ error: "Invalid owning unit" });
      return;
    }
  }
  const sendDateStr =
    fields.intendedSendStartDate instanceof Date
      ? fields.intendedSendStartDate.toISOString().slice(0, 10)
      : fields.intendedSendStartDate ?? null;
  const [row] = await db
    .insert(campaignsTable)
    .values({
      name: fields.name,
      owningUnit: fields.owningUnit,
      submittedByUserId: req.currentUser!.id,
      intendedSendStartDate: sendDateStr,
      audienceDescription: fields.audienceDescription,
      salesforceCampaignId: fields.salesforceCampaignId,
      internalNotes: fields.internalNotes,
      status: "draft",
    })
    .returning();
  await setCampaignTypes(row.id, campaignTypeIds);
  await audit({
    actor: req.currentUser!,
    action: "create_campaign",
    entityType: "campaign",
    entityId: row.id,
    details: row.name,
  });
  res.status(201).json(await loadCampaignFull(row.id));
});

router.get("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const c = await loadCampaignFull(params.data.id);
  if (!c) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(c);
});

router.patch("/campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCampaignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const access = await canMutateCampaign(params.data.id, req.currentUser!);
  if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
  if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }
  const existing = await loadCampaignFull(params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (
    existing.status === "exported" &&
    req.currentUser!.role === "standard"
  ) {
    res.status(403).json({ error: "Cannot edit an exported campaign" });
    return;
  }
  const { campaignTypeIds, ...fields } = body.data;
  if (
    fields.owningUnit !== undefined &&
    fields.owningUnit !== null &&
    fields.owningUnit !== "" &&
    fields.owningUnit !== existing.owningUnit
  ) {
    const [u] = await db
      .select({ id: owningUnitsTable.id })
      .from(owningUnitsTable)
      .where(and(eq(owningUnitsTable.name, fields.owningUnit), eq(owningUnitsTable.active, true)));
    if (!u) {
      res.status(400).json({ error: "Invalid owning unit" });
      return;
    }
  }
  const sendDateStr2 =
    fields.intendedSendStartDate instanceof Date
      ? fields.intendedSendStartDate.toISOString().slice(0, 10)
      : fields.intendedSendStartDate ?? null;
  await db
    .update(campaignsTable)
    .set({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.owningUnit !== undefined && { owningUnit: fields.owningUnit }),
      ...(fields.intendedSendStartDate !== undefined && {
        intendedSendStartDate: sendDateStr2,
      }),
      ...(fields.audienceDescription !== undefined && {
        audienceDescription: fields.audienceDescription,
      }),
      ...(fields.salesforceCampaignId !== undefined && {
        salesforceCampaignId: fields.salesforceCampaignId,
      }),
      ...(fields.internalNotes !== undefined && { internalNotes: fields.internalNotes }),
    })
    .where(eq(campaignsTable.id, params.data.id));
  if (campaignTypeIds) {
    await setCampaignTypes(params.data.id, campaignTypeIds);
  }
  await audit({
    actor: req.currentUser!,
    action: "update_campaign",
    entityType: "campaign",
    entityId: params.data.id,
  });
  res.json(await loadCampaignFull(params.data.id));
});

router.post(
  "/campaigns/:id/archive",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = ArchiveCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.status === "voided") {
      res.status(403).json({ error: "Cannot archive a voided campaign" });
      return;
    }
    await db
      .update(campaignsTable)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(campaignsTable.id, params.data.id));
    await audit({
      actor: req.currentUser!,
      action: "archive_campaign",
      entityType: "campaign",
      entityId: params.data.id,
    });
    const c = await loadCampaignFull(params.data.id);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  },
);

router.post(
  "/campaigns/:id/void",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = VoidCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (existing.status === "voided") {
      res.status(403).json({ error: "Campaign is already voided" });
      return;
    }
    await db
      .update(campaignsTable)
      .set({ status: "voided", voidedAt: new Date() })
      .where(eq(campaignsTable.id, params.data.id));
    await audit({
      actor: req.currentUser!,
      action: "void_campaign",
      entityType: "campaign",
      entityId: params.data.id,
    });
    const c = await loadCampaignFull(params.data.id);
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(c);
  },
);

void usersTable;
void campaignTypeLinksTable;
void campaignTypesTable;

export default router;
