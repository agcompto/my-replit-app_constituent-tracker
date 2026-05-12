import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, campaignsTable, campaignTypeLinksTable, campaignTypesTable, channelsTable, owningUnitsTable, touchesTable, usersTable, thresholdsTable, suppressionsTable, suppressionReasonCodesTable, seedGroupsTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  GetCampaignSummaryPdfParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  ArchiveCampaignParams,
  VoidCampaignParams,
  DeleteCampaignParams,
  CloneCampaignParams,
  CloneCampaignBody,
} from "@workspace/api-zod";
import PDFDocument from "pdfkit";
import { requireAuth, requireRole, audit, canMutateCampaign } from "../lib/auth";
import { requireRecentAuth } from "../lib/recentAuth";
import { loadCampaignFull, loadCampaignSummary, setCampaignTypes } from "../lib/campaigns";
import { executeClone } from "../lib/cloneCampaign";

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

router.post("/campaigns/:id/clone", requireAuth, async (req, res): Promise<void> => {
  const params = CloneCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CloneCampaignBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const source = await loadCampaignFull(params.data.id);
  if (!source) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const newName = body.data.name.trim();
  if (!newName) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const newIntendedSendDate =
    body.data.intendedSendStartDate instanceof Date
      ? body.data.intendedSendStartDate.toISOString().slice(0, 10)
      : (body.data.intendedSendStartDate ?? null);

  // Authorization note: cloning is gated on requireAuth only (not
  // canMutateCampaign). The product allows every authenticated staff member
  // to view every campaign via GET /campaigns/:id, so cloning the structural
  // setup into a new draft owned by the caller does not expose any data the
  // user could not already read. The clone is theirs to edit; the source is
  // unchanged.
  const result = await db.transaction((tx) =>
    executeClone(tx, {
      sourceCampaignId: source.id,
      actingUserId: req.currentUser!.id,
      actingUserName: req.currentUser!.name,
      actingUserRole: req.currentUser!.role,
      newName,
      newIntendedSendDate,
      explicitShiftDays:
        typeof body.data.dateShiftDays === "number"
          ? body.data.dateShiftDays
          : undefined,
    }),
  );

  const newCampaign = await loadCampaignFull(result.newCampaignId);
  res.status(201).json({
    campaign: newCampaign,
    copiedTouches: result.copiedTouches,
    copiedThresholds: result.copiedThresholds,
    copiedSuppressions: result.copiedSuppressions,
    skippedSuppressions: result.skippedSuppressions,
    copiedSeeds: result.copiedSeeds,
  });
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

router.get(
  "/campaigns/:id/summary.pdf",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = GetCampaignSummaryPdfParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const campaign = await loadCampaignFull(params.data.id);
    if (!campaign) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const touchRows = await db
      .select({
        id: touchesTable.id,
        touchName: touchesTable.touchName,
        sendDate: touchesTable.sendDate,
        audienceMode: touchesTable.audienceMode,
        customUniqueIdCount: touchesTable.customUniqueIdCount,
        channelLabel: channelsTable.name,
        campaignTypeLabel: campaignTypesTable.name,
      })
      .from(touchesTable)
      .leftJoin(channelsTable, eq(channelsTable.id, touchesTable.channelId))
      .leftJoin(campaignTypesTable, eq(campaignTypesTable.id, touchesTable.campaignTypeId))
      .where(eq(touchesTable.campaignId, params.data.id))
      .orderBy(touchesTable.sendDate);

    const thresholdRows = await db
      .select({
        id: thresholdsTable.id,
        name: thresholdsTable.name,
        maxTouchpoints: thresholdsTable.maxTouchpoints,
        windowDays: thresholdsTable.windowDays,
        scope: thresholdsTable.scope,
        actionMode: thresholdsTable.actionMode,
        channelLabel: channelsTable.name,
        campaignTypeLabel: campaignTypesTable.name,
      })
      .from(thresholdsTable)
      .leftJoin(channelsTable, eq(channelsTable.id, thresholdsTable.channelId))
      .leftJoin(
        campaignTypesTable,
        eq(campaignTypesTable.id, thresholdsTable.campaignTypeId),
      )
      .where(eq(thresholdsTable.campaignId, params.data.id))
      .orderBy(thresholdsTable.createdAt);

    const suppressionRows = await db
      .select({
        id: suppressionsTable.id,
        scope: suppressionsTable.scope,
        reason: suppressionsTable.reason,
        donorIds: suppressionsTable.donorIds,
        channelLabel: channelsTable.name,
        campaignTypeLabel: campaignTypesTable.name,
        touchLabel: touchesTable.touchName,
        reasonCodeName: suppressionReasonCodesTable.name,
      })
      .from(suppressionsTable)
      .leftJoin(channelsTable, eq(channelsTable.id, suppressionsTable.channelId))
      .leftJoin(
        campaignTypesTable,
        eq(campaignTypesTable.id, suppressionsTable.campaignTypeId),
      )
      .leftJoin(touchesTable, eq(touchesTable.id, suppressionsTable.touchId))
      .leftJoin(
        suppressionReasonCodesTable,
        eq(suppressionReasonCodesTable.id, suppressionsTable.reasonCodeId),
      )
      .where(eq(suppressionsTable.campaignId, params.data.id))
      .orderBy(suppressionsTable.createdAt);

    const seedRows = await db
      .select({
        id: seedGroupsTable.id,
        scope: seedGroupsTable.scope,
        donorIds: seedGroupsTable.donorIds,
        channelLabel: channelsTable.name,
        touchLabel: touchesTable.touchName,
      })
      .from(seedGroupsTable)
      .leftJoin(channelsTable, eq(channelsTable.id, seedGroupsTable.channelId))
      .leftJoin(touchesTable, eq(touchesTable.id, seedGroupsTable.touchId))
      .where(eq(seedGroupsTable.campaignId, params.data.id))
      .orderBy(seedGroupsTable.createdAt);

    const safeName =
      campaign.name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) ||
      `campaign_${campaign.id}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}_summary.pdf"`,
    );

    const doc = new PDFDocument({ size: "LETTER", margin: 54 });
    doc.pipe(res);

    const fmtDate = (s: string | null | undefined): string => {
      if (!s) return "-";
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return "-";
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
    };
    const fmtNum = (n: number | null | undefined): string =>
      (n ?? 0).toLocaleString("en-US");

    doc.font("Helvetica-Bold").fontSize(20).text(campaign.name);
    doc
      .moveDown(0.25)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#555")
      .text(
        `Campaign Summary  ·  Submitted by ${campaign.submittedByName}  ·  Status: ${campaign.status}`,
      );
    doc.moveDown(0.5);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor("#cccccc")
      .lineWidth(1)
      .stroke();
    doc.fillColor("black").moveDown(0.75);

    const sectionTitle = (s: string) => {
      doc.font("Helvetica-Bold").fontSize(13).fillColor("black").text(s);
      doc.moveDown(0.4);
    };
    const labelValue = (label: string, value: string, x: number, y: number, w: number) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#666")
        .text(label.toUpperCase(), x, y, { width: w });
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("black")
        .text(value, x, doc.y + 1, { width: w });
    };

    sectionTitle("Details");
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = usableWidth / 2;
    let yStart = doc.y;
    labelValue("Owning Unit", campaign.owningUnit || "-", doc.page.margins.left, yStart, colW);
    const leftBottom1 = doc.y;
    labelValue(
      "Intended Send Date",
      fmtDate(campaign.intendedSendStartDate),
      doc.page.margins.left + colW,
      yStart,
      colW,
    );
    const rightBottom1 = doc.y;
    yStart = Math.max(leftBottom1, rightBottom1) + 8;
    labelValue(
      "Salesforce ID",
      campaign.salesforceCampaignId || "-",
      doc.page.margins.left,
      yStart,
      colW,
    );
    const leftBottom2 = doc.y;
    labelValue(
      "Campaign Types",
      campaign.campaignTypes.length
        ? campaign.campaignTypes.map((t) => t.name).join(", ")
        : "-",
      doc.page.margins.left + colW,
      yStart,
      colW,
    );
    const rightBottom2 = doc.y;
    doc.x = doc.page.margins.left;
    doc.y = Math.max(leftBottom2, rightBottom2) + 16;

    sectionTitle("Audience Summary");
    const audCols = [
      { label: "Valid IDs", value: fmtNum(campaign.validIdCount) },
      { label: "Unique IDs", value: fmtNum(campaign.uniqueIdCount) },
      { label: "Rejected", value: fmtNum(campaign.rejectedIdCount) },
      { label: "Duplicates", value: fmtNum(campaign.duplicateIdCount) },
    ];
    const audColW = usableWidth / audCols.length;
    const audY = doc.y;
    audCols.forEach((c, i) => {
      const x = doc.page.margins.left + i * audColW;
      doc
        .font("Helvetica-Bold")
        .fontSize(8)
        .fillColor("#666")
        .text(c.label.toUpperCase(), x, audY, { width: audColW });
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("black")
        .text(c.value, x, audY + 14, { width: audColW });
    });
    doc.x = doc.page.margins.left;
    doc.y = audY + 14 + 22;

    sectionTitle("Planned Touches");
    if (touchRows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text("No touchpoints defined for this campaign.");
    } else {
      const cols = [
        { key: "name", label: "Name", w: 0.28 },
        { key: "channel", label: "Channel", w: 0.16 },
        { key: "type", label: "Type", w: 0.18 },
        { key: "date", label: "Send Date", w: 0.18 },
        { key: "audience", label: "Audience", w: 0.20, align: "right" as const },
      ];
      const colWidths = cols.map((c) => c.w * usableWidth);
      const colX = (i: number) =>
        doc.page.margins.left +
        colWidths.slice(0, i).reduce((a, b) => a + b, 0);

      const drawHeader = () => {
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
        cols.forEach((c, i) => {
          doc.text(c.label, colX(i), y, {
            width: colWidths[i],
            align: c.align ?? "left",
          });
        });
        doc.y = y + 14;
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#cccccc")
          .lineWidth(0.5)
          .stroke();
        doc.y += 4;
      };

      drawHeader();

      for (const t of touchRows) {
        const custom = t.audienceMode === "custom";
        const audienceCount = custom
          ? t.customUniqueIdCount ?? 0
          : campaign.uniqueIdCount ?? 0;
        const audienceLabel = custom ? "Custom" : "Campaign-wide";
        const sendDateStr =
          typeof t.sendDate === "string"
            ? t.sendDate
            : (t.sendDate as Date).toISOString().slice(0, 10);
        const values = [
          t.touchName,
          t.channelLabel ?? "Unknown",
          t.campaignTypeLabel ?? "Unknown",
          fmtDate(sendDateStr),
          `${audienceLabel} · ${fmtNum(audienceCount)}`,
        ];
        const rowY = doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("black");
        const rowHeights = values.map((v, i) =>
          doc.heightOfString(v, {
            width: colWidths[i],
            align: cols[i].align ?? "left",
          }),
        );
        const rowHeight = Math.max(...rowHeights) + 6;
        if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawHeader();
        }
        const yy = doc.y;
        values.forEach((v, i) => {
          doc.text(v, colX(i), yy, {
            width: colWidths[i],
            align: cols[i].align ?? "left",
          });
        });
        doc.y = yy + rowHeight - 6;
        doc
          .moveTo(doc.page.margins.left, doc.y + 2)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
          .strokeColor("#eeeeee")
          .lineWidth(0.5)
          .stroke();
        doc.y += 6;
      }
    }

    const ACTION_MODE_LABELS: Record<string, string> = {
      track: "Track Only",
      flag: "Flag",
      remove: "Remove Flagged",
      manual: "Manual Review",
    };
    const thresholdScopeLabel = (
      scope: string,
      channel: string | null,
      type: string | null,
    ): string => {
      if (scope === "all") return "All communications";
      if (scope === "channel") return `Channel: ${channel ?? "-"}`;
      if (scope === "campaign_type") return `Type: ${type ?? "-"}`;
      if (scope === "channel_and_type")
        return `${channel ?? "-"} \u00b7 ${type ?? "-"}`;
      return scope;
    };
    const suppressionScopeLabel = (
      scope: string,
      channel: string | null,
      type: string | null,
      touch: string | null,
    ): string => {
      if (scope === "all") return "All touches";
      if (scope === "channel") return `Channel: ${channel ?? "-"}`;
      if (scope === "campaign_type") return `Type: ${type ?? "-"}`;
      if (scope === "touch") return `Touch: ${touch ?? "-"}`;
      return scope;
    };
    const seedScopeLabel = (
      scope: string,
      channel: string | null,
      touch: string | null,
    ): string => {
      if (scope === "all") return "All touches";
      if (scope === "channel") return `Channel: ${channel ?? "-"}`;
      if (scope === "touch") return `Touch: ${touch ?? "-"}`;
      return scope;
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
    };

    const drawSimpleTable = (
      cols: Array<{ label: string; w: number; align?: "left" | "right" }>,
      rows: string[][],
    ) => {
      const colWidths = cols.map((c) => c.w * usableWidth);
      const colX = (i: number) =>
        doc.page.margins.left + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      const drawHeader = () => {
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("black");
        cols.forEach((c, i) => {
          doc.text(c.label, colX(i), y, {
            width: colWidths[i],
            align: c.align ?? "left",
          });
        });
        doc.y = y + 14;
        doc
          .moveTo(doc.page.margins.left, doc.y)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y)
          .strokeColor("#cccccc")
          .lineWidth(0.5)
          .stroke();
        doc.y += 4;
      };
      drawHeader();
      for (const values of rows) {
        const rowY = doc.y;
        doc.font("Helvetica").fontSize(10).fillColor("black");
        const rowHeights = values.map((v, i) =>
          doc.heightOfString(v, {
            width: colWidths[i],
            align: cols[i].align ?? "left",
          }),
        );
        const rowHeight = Math.max(...rowHeights) + 6;
        if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawHeader();
        }
        const yy = doc.y;
        values.forEach((v, i) => {
          doc.text(v, colX(i), yy, {
            width: colWidths[i],
            align: cols[i].align ?? "left",
          });
        });
        doc.y = yy + rowHeight - 6;
        doc
          .moveTo(doc.page.margins.left, doc.y + 2)
          .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
          .strokeColor("#eeeeee")
          .lineWidth(0.5)
          .stroke();
        doc.y += 6;
      }
    };

    doc.x = doc.page.margins.left;
    doc.moveDown(0.5);
    ensureSpace(60);
    sectionTitle("Thresholds");
    if (thresholdRows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text("None.");
    } else {
      drawSimpleTable(
        [
          { label: "Name", w: 0.28 },
          { label: "Scope", w: 0.32 },
          { label: "Max Touches", w: 0.14, align: "right" },
          { label: "Window (days)", w: 0.14, align: "right" },
          { label: "Action", w: 0.12 },
        ],
        thresholdRows.map((t) => [
          t.name,
          thresholdScopeLabel(t.scope, t.channelLabel, t.campaignTypeLabel),
          String(t.maxTouchpoints),
          String(t.windowDays),
          ACTION_MODE_LABELS[t.actionMode] ?? t.actionMode,
        ]),
      );
    }

    doc.x = doc.page.margins.left;
    doc.moveDown(0.5);
    ensureSpace(60);
    sectionTitle("Suppressions");
    if (suppressionRows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text("None.");
    } else {
      const totalSuppressed = suppressionRows.reduce(
        (sum, s) => sum + (s.donorIds?.length ?? 0),
        0,
      );
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("black")
        .text(
          `${suppressionRows.length} suppression${suppressionRows.length === 1 ? "" : "s"} covering ${fmtNum(totalSuppressed)} constituent ID${totalSuppressed === 1 ? "" : "s"}.`,
        );
      doc.moveDown(0.4);

      const byReason = new Map<string, number>();
      for (const s of suppressionRows) {
        const key = s.reasonCodeName ?? s.reason ?? "Unspecified";
        byReason.set(key, (byReason.get(key) ?? 0) + (s.donorIds?.length ?? 0));
      }
      if (byReason.size > 0) {
        doc
          .font("Helvetica-Bold")
          .fontSize(8)
          .fillColor("#666")
          .text("BY REASON");
        doc.font("Helvetica").fontSize(10).fillColor("black");
        for (const [reason, count] of byReason) {
          doc.text(`  \u2022 ${reason}: ${fmtNum(count)}`);
        }
        doc.moveDown(0.4);
      }

      drawSimpleTable(
        [
          { label: "Scope", w: 0.45 },
          { label: "Reason", w: 0.40 },
          { label: "IDs", w: 0.15, align: "right" },
        ],
        suppressionRows.map((s) => [
          suppressionScopeLabel(s.scope, s.channelLabel, s.campaignTypeLabel, s.touchLabel),
          s.reasonCodeName ?? s.reason ?? "Unspecified",
          fmtNum(s.donorIds?.length ?? 0),
        ]),
      );
    }

    doc.x = doc.page.margins.left;
    doc.moveDown(0.5);
    ensureSpace(60);
    sectionTitle("Seeds");
    if (seedRows.length === 0) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#666")
        .text("None.");
    } else {
      drawSimpleTable(
        [
          { label: "Scope", w: 0.80 },
          { label: "Seed IDs", w: 0.20, align: "right" },
        ],
        seedRows.map((s) => [
          seedScopeLabel(s.scope, s.channelLabel, s.touchLabel),
          fmtNum(s.donorIds?.length ?? 0),
        ]),
      );
    }

    doc.x = doc.page.margins.left;
    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#888")
      .text(
        `Generated ${new Date().toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
        doc.page.margins.left,
        undefined,
        { align: "left" },
      );

    doc.end();
  },
);

router.delete(
  "/campaigns/:id",
  requireRole("super_admin"),
  requireRecentAuth,
  async (req, res): Promise<void> => {
    const params = DeleteCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [existing] = await db
      .select({ id: campaignsTable.id, name: campaignsTable.name, status: campaignsTable.status })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Audit BEFORE delete (FK to campaign is nullable on audit_log via
    // entity_id; row stays even after the campaign is gone).
    await audit({
      actor: req.currentUser!,
      action: "delete_campaign",
      entityType: "campaign",
      entityId: existing.id,
      details: `Permanently deleted "${existing.name}" (status=${existing.status})`,
    });
    // FKs from touches/audience/thresholds/etc. all cascade on delete.
    await db.delete(campaignsTable).where(eq(campaignsTable.id, params.data.id));
    res.status(204).end();
  },
);

void usersTable;
void campaignTypesTable;

export default router;
