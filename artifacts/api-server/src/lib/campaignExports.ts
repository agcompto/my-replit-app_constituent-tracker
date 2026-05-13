import { Writable } from "node:stream";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignTypesTable,
  channelsTable,
  exportJobsTable,
  seedGroupsTable,
  suppressionReasonCodesTable,
  suppressionsTable,
  thresholdsTable,
  touchesTable,
  touchpointsTable,
  usersTable,
} from "@workspace/db";
import PDFDocument from "pdfkit";
import { loadCampaignFull } from "./campaigns";
import { buildCsv } from "./donor";

/**
 * Build the per-touch CSVs that the existing single-campaign download
 * route (`GET /campaigns/:id/exports/:touchId.csv`) emits, but for every
 * touch in the campaign in one shot. Returns one entry per export job
 * recorded for this campaign's most recent export batch. Returns null
 * when the campaign has not been exported yet (no `exportedAt`), so the
 * caller can skip-with-status instead of zipping an empty folder.
 *
 * Used by the bulk-export ZIP endpoint so a single bulk request shares
 * one source of truth with the per-touch download route — donor IDs are
 * wrapped as Excel text-formula `="00012345"` so leading zeros survive.
 */
export async function buildCampaignTouchpointCsvs(
  campaignId: number,
): Promise<{
  campaignName: string;
  totalRows: number;
  files: Array<{ fileName: string; csv: string; rowCount: number }>;
} | null> {
  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      exportedAt: campaignsTable.exportedAt,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign || !campaign.exportedAt) return null;

  const jobs = await db
    .select({
      touchId: exportJobsTable.touchId,
      fileName: exportJobsTable.fileName,
      rowCount: exportJobsTable.rowCount,
      exportedAt: exportJobsTable.exportedAt,
    })
    .from(exportJobsTable)
    .where(eq(exportJobsTable.campaignId, campaignId))
    .orderBy(exportJobsTable.exportedAt);

  // Filter to the most recent batch (within 60s of campaign.exportedAt) so
  // we don't bundle stale per-touch files from prior re-exports.
  const batchTs = campaign.exportedAt.getTime();
  const batch = jobs.filter(
    (j) => Math.abs(j.exportedAt.getTime() - batchTs) < 60_000,
  );

  const files: Array<{ fileName: string; csv: string; rowCount: number }> = [];
  let totalRows = 0;
  for (const j of batch) {
    if (j.touchId == null) continue;
    const rows = await db
      .select({
        donorId: touchpointsTable.donorId,
        isSeed: touchpointsTable.isSeed,
      })
      .from(touchpointsTable)
      .where(
        and(
          eq(touchpointsTable.campaignId, campaignId),
          eq(touchpointsTable.touchId, j.touchId),
        ),
      );
    rows.sort((a, b) => {
      if (a.isSeed === b.isSeed) return a.donorId.localeCompare(b.donorId);
      return a.isSeed ? 1 : -1;
    });
    const lines = ["donor_id"];
    for (const r of rows) lines.push(`="${r.donorId}"`);
    const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
    files.push({ fileName: j.fileName, csv, rowCount: rows.length });
    totalRows += rows.length;
  }
  return { campaignName: campaign.name, totalRows, files };
}

export function safeFilenamePart(name: string, fallbackId: number): string {
  return (
    name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) ||
    `campaign_${fallbackId}`
  );
}

export async function summaryPdfFilename(campaignId: number): Promise<string | null> {
  const c = await loadCampaignFull(campaignId);
  if (!c) return null;
  return `${safeFilenamePart(c.name, c.id)}_summary.pdf`;
}

export async function manifestCsvFilename(campaignId: number): Promise<string | null> {
  const c = await loadCampaignFull(campaignId);
  if (!c) return null;
  return `${safeFilenamePart(c.name, c.id)}_export_manifest.csv`;
}

/**
 * Stream a campaign-summary PDF into the given writable. Resolves once the
 * PDF stream finishes. Returns null and writes nothing if the campaign does
 * not exist.
 */
export async function writeCampaignSummaryPdf(
  campaignId: number,
  writable: Writable,
): Promise<{ filename: string } | null> {
  const campaign = await loadCampaignFull(campaignId);
  if (!campaign) return null;

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
    .where(eq(touchesTable.campaignId, campaignId))
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
    .where(eq(thresholdsTable.campaignId, campaignId))
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
    .where(eq(suppressionsTable.campaignId, campaignId))
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
    .where(eq(seedGroupsTable.campaignId, campaignId))
    .orderBy(seedGroupsTable.createdAt);

  const filename = `${safeFilenamePart(campaign.name, campaign.id)}_summary.pdf`;

  const doc = new PDFDocument({ size: "LETTER", margin: 54 });
  const done = new Promise<void>((resolve, reject) => {
    writable.on("finish", () => resolve());
    writable.on("close", () => resolve());
    writable.on("error", reject);
  });
  doc.pipe(writable);

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
    doc.font("Helvetica").fontSize(10).fillColor("#666").text("None.");
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
    doc.font("Helvetica").fontSize(10).fillColor("#666").text("None.");
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
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#666").text("BY REASON");
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
    doc.font("Helvetica").fontSize(10).fillColor("#666").text("None.");
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
  await done;
  return { filename };
}

/**
 * Build the export-manifest CSV body for a campaign. Returns null if the
 * campaign does not exist or has never been exported (so the caller can
 * decide whether to skip or surface a friendly error).
 */
export async function buildCampaignManifestCsv(
  campaignId: number,
): Promise<{ filename: string; csv: string } | null> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!campaign) return null;
  if (!campaign.exportedAt) return null;

  const jobs = await db
    .select({
      fileName: exportJobsTable.fileName,
      rowCount: exportJobsTable.rowCount,
      seedCount: exportJobsTable.seedCount,
      suppressedCount: exportJobsTable.suppressedCount,
      exportedAt: exportJobsTable.exportedAt,
      exportedByName: usersTable.name,
      touchName: touchesTable.touchName,
      sendDate: touchesTable.sendDate,
      channelLabel: channelsTable.name,
      campaignTypeLabel: campaignTypesTable.name,
    })
    .from(exportJobsTable)
    .leftJoin(touchesTable, eq(touchesTable.id, exportJobsTable.touchId))
    .leftJoin(channelsTable, eq(channelsTable.id, touchesTable.channelId))
    .leftJoin(
      campaignTypesTable,
      eq(campaignTypesTable.id, touchesTable.campaignTypeId),
    )
    .leftJoin(usersTable, eq(usersTable.id, exportJobsTable.exportedByUserId))
    .where(eq(exportJobsTable.campaignId, campaignId))
    .orderBy(desc(exportJobsTable.exportedAt));

  const batchTs = campaign.exportedAt.getTime();
  const batch = jobs.filter(
    (j) => Math.abs(j.exportedAt.getTime() - batchTs) < 60_000,
  );

  const headers = [
    "file_name",
    "campaign_id",
    "campaign_name",
    "owning_unit",
    "touch_name",
    "channel",
    "campaign_type",
    "send_date",
    "row_count",
    "seed_count",
    "suppressed_count",
    "exported_by",
    "exported_at",
  ];
  const rows = batch.map((j) => [
    j.fileName,
    campaign.id,
    campaign.name,
    campaign.owningUnit,
    j.touchName,
    j.channelLabel,
    j.campaignTypeLabel,
    j.sendDate,
    j.rowCount,
    j.seedCount,
    j.suppressedCount,
    j.exportedByName ?? "",
    j.exportedAt.toISOString(),
  ]);
  const csv = "\uFEFF" + buildCsv(headers, rows);
  const filename = `${safeFilenamePart(campaign.name, campaign.id)}_export_manifest.csv`;
  return { filename, csv };
}
