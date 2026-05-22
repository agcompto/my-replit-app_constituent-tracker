import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, touchesTable, channelsTable, campaignTypesTable, touchAudienceDonorsTable, auditLogTable } from "@workspace/db";
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
  ApplyAiDateShiftParams,
  ApplyAiDateShiftBody,
  GetLastAiDateShiftParams,
  UndoAiDateShiftParams,
  GetLastManualDateEditParams,
  UndoManualDateEditParams,
  GetTouchDateHistoryParams,
} from "@workspace/api-zod";
import { requireAuth, audit, canMutateCampaign } from "../lib/auth";
import { resolveAudienceSource } from "../lib/audienceSource";
import { googleSheetImportAllowed } from "../lib/appSettings";

const router: IRouter = Router();

type TouchRow = typeof touchesTable.$inferSelect;

function touchSendDate(t: TouchRow): string {
  return typeof t.sendDate === "string"
    ? t.sendDate
    : (t.sendDate as Date).toISOString().slice(0, 10);
}

function shapeTouchRow(
  t: TouchRow,
  channelLabels: Map<number, string>,
  typeLabels: Map<number, string>,
) {
  return {
    id: t.id,
    campaignId: t.campaignId,
    touchName: t.touchName,
    channelId: t.channelId,
    channelLabel: channelLabels.get(t.channelId) ?? "Unknown",
    campaignTypeId: t.campaignTypeId,
    campaignTypeLabel: typeLabels.get(t.campaignTypeId) ?? "Unknown",
    sendDate: touchSendDate(t),
    notes: t.notes,
    motivationCode: t.motivationCode,
    marketingCampaignName: t.marketingCampaignName,
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

async function shapeTouches(rows: TouchRow[]) {
  if (rows.length === 0) return [];
  const channelIds = [...new Set(rows.map((r) => r.channelId))];
  const typeIds = [...new Set(rows.map((r) => r.campaignTypeId))];
  const [channels, types] = await Promise.all([
    channelIds.length
      ? db.select().from(channelsTable).where(inArray(channelsTable.id, channelIds))
      : Promise.resolve([]),
    typeIds.length
      ? db.select().from(campaignTypesTable).where(inArray(campaignTypesTable.id, typeIds))
      : Promise.resolve([]),
  ]);
  const channelLabels = new Map(channels.map((c) => [c.id, c.name]));
  const typeLabels = new Map(types.map((tp) => [tp.id, tp.name]));
  return rows.map((t) => shapeTouchRow(t, channelLabels, typeLabels));
}

async function shapeTouch(t: TouchRow) {
  const [shaped] = await shapeTouches([t]);
  return shaped!;
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
  res.json(await shapeTouches(rows));
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
      motivationCode: body.data.motivationCode || null,
      marketingCampaignName: body.data.marketingCampaignName || null,
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
    // Read the existing row so we can detect a manual send-date change and
    // record the from→to in the audit row that powers the wizard's "Undo"
    // affordance on the touches step.
    const [prior] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!prior) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const priorISO = typeof prior.sendDate === "string"
      ? prior.sendDate
      : (prior.sendDate as Date).toISOString().slice(0, 10);
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
    const newISO = typeof row.sendDate === "string"
      ? row.sendDate
      : (row.sendDate as Date).toISOString().slice(0, 10);
    const sendDateChanged =
      typeof updates.sendDate === "string" && newISO !== priorISO;
    await audit({
      actor: req.currentUser!,
      action: "update_touch",
      entityType: "touch",
      entityId: row.id,
      details: sendDateChanged
        ? `source=manual_edit from=${priorISO} to=${newISO}`
        : undefined,
    });
    res.json(await shapeTouch(row));
  },
);

router.post(
  "/campaigns/:id/touches/:touchId/apply-ai-date-shift",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ApplyAiDateShiftParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = ApplyAiDateShiftBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

    const proposed = body.data.proposedSendDate instanceof Date
      ? body.data.proposedSendDate.toISOString().slice(0, 10)
      : String(body.data.proposedSendDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(proposed)) {
      res.status(400).json({ error: "Invalid proposedSendDate" });
      return;
    }
    {
      const [y, m, d] = proposed.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== m - 1 ||
        dt.getUTCDate() !== d
      ) {
        res.status(400).json({ error: "Invalid calendar date" });
        return;
      }
    }

    const [existing] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const previousISO = typeof existing.sendDate === "string"
      ? existing.sendDate
      : (existing.sendDate as Date).toISOString().slice(0, 10);

    // Defense-in-depth: even though the UI only POSTs server-validated
    // suggestions, the apply route is its own trust boundary. Reject
    // requests that violate the AI date-shift contract (±7 days from the
    // touch's current send date, not in the past).
    const todayISO = new Date().toISOString().slice(0, 10);
    if (proposed < todayISO) {
      res.status(400).json({ error: "Proposed date is in the past" });
      return;
    }
    const [py, pm, pd] = proposed.split("-").map(Number);
    const [cy, cm, cd] = previousISO.split("-").map(Number);
    const diffDays = Math.round(
      (Date.UTC(py, pm - 1, pd) - Date.UTC(cy, cm - 1, cd)) / 86400000,
    );
    if (Math.abs(diffDays) > 7) {
      res.status(400).json({ error: "Proposed date must be within ±7 days of the current send date" });
      return;
    }

    const [row] = await db
      .update(touchesTable)
      .set({ sendDate: proposed })
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // Same standard touch-update audit row that PATCH /touches/:id writes,
    // so general "who changed this touch?" queries don't have to special-case
    // the AI path...
    await audit({
      actor: req.currentUser!,
      action: "update_touch",
      entityType: "touch",
      entityId: row.id,
    });
    // ...plus an additional AI-originated audit row that records the source
    // and the from→to dates, so AI-driven changes can be filtered separately.
    await audit({
      actor: req.currentUser!,
      action: "touch_date_shift_applied",
      entityType: "touch",
      entityId: row.id,
      details: `source=ai_suggestion from=${previousISO} to=${proposed}`,
    });
    res.json(await shapeTouch(row));
  },
);

// Look up the most recent AI-applied date shift on a touch that the user can
// still undo. "Undoable" means: an `touch_date_shift_applied` audit row exists
// for this touch that is newer than any `touch_date_shift_undone` row, the
// touch's current `sendDate` still matches that audit row's `to=` value (so
// nothing has been changed since), and the campaign is still mutable.
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

async function findLastUndoableShift(touchId: number): Promise<
  { from: string; to: string; appliedAt: string } | null
> {
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(and(
      eq(auditLogTable.entityType, "touch"),
      eq(auditLogTable.entityId, touchId),
    ))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(50);
  let applied: { from: string; to: string; appliedAt: string } | null = null;
  for (const r of rows) {
    if (r.action === "touch_date_shift_undone") return null;
    if (r.action === "touch_date_shift_applied") {
      const m = /from=(\d{4}-\d{2}-\d{2}) to=(\d{4}-\d{2}-\d{2})/.exec(r.details ?? "");
      if (!m) return null;
      applied = { from: m[1], to: m[2], appliedAt: r.createdAt.toISOString() };
      break;
    }
  }
  if (!applied) return null;
  if (Date.now() - new Date(applied.appliedAt).getTime() > UNDO_WINDOW_MS) return null;
  return applied;
}

router.get(
  "/campaigns/:id/touches/:touchId/last-ai-date-shift",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetLastAiDateShiftParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.json({ available: false }); return; }
    const [touch] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!touch) { res.status(404).json({ error: "Not found" }); return; }
    const currentISO = typeof touch.sendDate === "string"
      ? touch.sendDate
      : (touch.sendDate as Date).toISOString().slice(0, 10);
    const last = await findLastUndoableShift(params.data.touchId);
    if (!last || last.to !== currentISO) {
      res.json({ available: false });
      return;
    }
    res.json({ available: true, from: last.from, to: last.to, appliedAt: last.appliedAt });
  },
);

router.post(
  "/campaigns/:id/touches/:touchId/undo-ai-date-shift",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UndoAiDateShiftParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

    const [existing] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const currentISO = typeof existing.sendDate === "string"
      ? existing.sendDate
      : (existing.sendDate as Date).toISOString().slice(0, 10);

    const last = await findLastUndoableShift(params.data.touchId);
    if (!last) {
      res.status(409).json({ error: "No recent AI date shift to undo" });
      return;
    }
    if (last.to !== currentISO) {
      res.status(409).json({ error: "Touch has changed since the AI shift was applied; cannot undo" });
      return;
    }

    const [row] = await db
      .update(touchesTable)
      .set({ sendDate: last.from })
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    await audit({
      actor: req.currentUser!,
      action: "update_touch",
      entityType: "touch",
      entityId: row.id,
    });
    await audit({
      actor: req.currentUser!,
      action: "touch_date_shift_undone",
      entityType: "touch",
      entityId: row.id,
      details: `source=ai_suggestion_undo from=${last.to} to=${last.from}`,
    });
    res.json(await shapeTouch(row));
  },
);

// Manual send-date edit undo. Walks `entityType=touch entityId=touchId` audit
// rows newest-to-oldest looking for the most recent `update_touch` row whose
// details match `source=manual_edit from=X to=Y`. If we hit a
// `touch_date_manual_undone` first, the latest manual edit was already undone.
// We do NOT short-circuit on `update_touch` rows without a manual-edit detail
// (e.g. a name-only change), since those should not block undoing an earlier
// date change.
async function findLastUndoableManualDateEdit(touchId: number): Promise<
  { from: string; to: string; editedAt: string } | null
> {
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(and(
      eq(auditLogTable.entityType, "touch"),
      eq(auditLogTable.entityId, touchId),
    ))
    .orderBy(desc(auditLogTable.createdAt))
    .limit(50);
  for (const r of rows) {
    if (r.action === "touch_date_manual_undone") return null;
    if (r.action === "update_touch") {
      const m = /source=manual_edit from=(\d{4}-\d{2}-\d{2}) to=(\d{4}-\d{2}-\d{2})/.exec(r.details ?? "");
      if (m) {
        const editedAt = r.createdAt.toISOString();
        if (Date.now() - new Date(editedAt).getTime() > UNDO_WINDOW_MS) return null;
        return { from: m[1], to: m[2], editedAt };
      }
    }
  }
  return null;
}

router.get(
  "/campaigns/:id/touches/:touchId/date-history",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetTouchDateHistoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Read access mirrors viewing the touch — all authenticated staff can see
    // a campaign's data per the product's shared-visibility rule. We still
    // verify the touch belongs to the campaign so the URL can't be used to
    // probe arbitrary touch IDs.
    const [touch] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!touch) { res.status(404).json({ error: "Not found" }); return; }

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.entityType, "touch"),
        eq(auditLogTable.entityId, params.data.touchId),
      ))
      .orderBy(desc(auditLogTable.createdAt));

    const KIND_BY_ACTION: Record<string, "manual_edit" | "ai_applied" | "ai_undone" | "manual_undone"> = {
      update_touch: "manual_edit",
      touch_date_shift_applied: "ai_applied",
      touch_date_shift_undone: "ai_undone",
      touch_date_manual_undone: "manual_undone",
    };

    const entries: Array<{
      at: string;
      actorName: string;
      actorRole: string;
      kind: string;
      from: string;
      to: string;
    }> = [];
    for (const r of rows) {
      const kind = KIND_BY_ACTION[r.action];
      if (!kind) continue;
      const m = /from=(\d{4}-\d{2}-\d{2}) to=(\d{4}-\d{2}-\d{2})/.exec(r.details ?? "");
      if (!m) continue;
      entries.push({
        at: r.createdAt.toISOString(),
        actorName: r.actorName,
        actorRole: r.actorRole,
        kind,
        from: m[1],
        to: m[2],
      });
    }

    res.json({ touchId: params.data.touchId, entries });
  },
);

router.get(
  "/campaigns/:id/touches/:touchId/last-manual-date-edit",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetLastManualDateEditParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.json({ available: false }); return; }
    const [touch] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!touch) { res.status(404).json({ error: "Not found" }); return; }
    const currentISO = typeof touch.sendDate === "string"
      ? touch.sendDate
      : (touch.sendDate as Date).toISOString().slice(0, 10);
    const last = await findLastUndoableManualDateEdit(params.data.touchId);
    if (!last || last.to !== currentISO) {
      res.json({ available: false });
      return;
    }
    res.json({ available: true, from: last.from, to: last.to, editedAt: last.editedAt });
  },
);

router.post(
  "/campaigns/:id/touches/:touchId/undo-manual-date-edit",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UndoManualDateEditParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const access = await canMutateCampaign(params.data.id, req.currentUser!);
    if (access === "not_found") { res.status(404).json({ error: "Not found" }); return; }
    if (access === "forbidden") { res.status(403).json({ error: "Forbidden" }); return; }
    if (access === "voided") { res.status(403).json({ error: "Cannot modify a voided campaign" }); return; }

    const [existing] = await db
      .select()
      .from(touchesTable)
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const currentISO = typeof existing.sendDate === "string"
      ? existing.sendDate
      : (existing.sendDate as Date).toISOString().slice(0, 10);

    const last = await findLastUndoableManualDateEdit(params.data.touchId);
    if (!last) {
      res.status(409).json({ error: "No recent manual date change to undo" });
      return;
    }
    if (last.to !== currentISO) {
      res.status(409).json({ error: "Touch has changed since the manual edit; cannot undo" });
      return;
    }

    const [row] = await db
      .update(touchesTable)
      .set({ sendDate: last.from })
      .where(and(
        eq(touchesTable.id, params.data.touchId),
        eq(touchesTable.campaignId, params.data.id),
      ))
      .returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    await audit({
      actor: req.currentUser!,
      action: "update_touch",
      entityType: "touch",
      entityId: row.id,
    });
    await audit({
      actor: req.currentUser!,
      action: "touch_date_manual_undone",
      entityType: "touch",
      entityId: row.id,
      details: `source=manual_undo from=${last.to} to=${last.from}`,
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
