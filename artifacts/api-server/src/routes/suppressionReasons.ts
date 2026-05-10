import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppressionReasonCodesTable } from "@workspace/db";
import {
  CreateSuppressionReasonBody,
  UpdateSuppressionReasonParams,
  UpdateSuppressionReasonBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole, audit } from "../lib/auth";

const router: IRouter = Router();

function serialize(r: typeof suppressionReasonCodesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    active: r.active,
    systemDefault: r.systemDefault,
    createdAt: r.createdAt.toISOString(),
  };
}

// Any authenticated user can list reason codes (they need them in the suppression dropdown).
router.get("/suppression-reasons", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(suppressionReasonCodesTable)
    .orderBy(suppressionReasonCodesTable.name);
  res.json(rows.map(serialize));
});

router.post(
  "/suppression-reasons",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const body = CreateSuppressionReasonBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const name = body.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const existing = await db
      .select({ id: suppressionReasonCodesTable.id })
      .from(suppressionReasonCodesTable)
      .where(eq(suppressionReasonCodesTable.name, name));
    if (existing.length > 0) {
      res.status(409).json({ error: "A reason code with that name already exists." });
      return;
    }
    const [row] = await db
      .insert(suppressionReasonCodesTable)
      .values({
        name,
        description: body.data.description ?? null,
        active: body.data.active ?? true,
        systemDefault: false,
      })
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "create_suppression_reason",
      entityType: "suppression_reason",
      entityId: row.id,
      details: name,
    });
    res.status(201).json(serialize(row));
  },
);

router.patch(
  "/suppression-reasons/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateSuppressionReasonParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateSuppressionReasonBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(suppressionReasonCodesTable)
      .where(eq(suppressionReasonCodesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // System defaults: only super_admin may toggle their active flag, and they can't be renamed.
    if (existing.systemDefault) {
      if (body.data.name !== undefined && body.data.name.trim() !== existing.name) {
        res.status(403).json({ error: "System default reason codes cannot be renamed." });
        return;
      }
      if (req.currentUser!.role !== "super_admin" && body.data.active !== undefined) {
        res.status(403).json({ error: "Only a super admin can deactivate a system default reason code." });
        return;
      }
    }
    const update: Partial<typeof suppressionReasonCodesTable.$inferInsert> = {};
    if (body.data.name !== undefined) update.name = body.data.name.trim();
    if (body.data.description !== undefined) update.description = body.data.description;
    if (body.data.active !== undefined) update.active = body.data.active;
    const [row] = await db
      .update(suppressionReasonCodesTable)
      .set(update)
      .where(eq(suppressionReasonCodesTable.id, params.data.id))
      .returning();
    await audit({
      actor: req.currentUser!,
      action: "update_suppression_reason",
      entityType: "suppression_reason",
      entityId: row.id,
    });
    res.json(serialize(row));
  },
);

export default router;
