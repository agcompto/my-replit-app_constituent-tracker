import { Router, type IRouter, type Request } from "express";
import { desc, sql, type SQL } from "drizzle-orm";
import {
  db,
  touchpointsTable,
  campaignsTable,
  channelsTable,
  campaignTypesTable,
  uploadJobsTable,
  exportJobsTable,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../lib/auth";
import { loadCampaignSummary } from "../lib/campaigns";

const router: IRouter = Router();

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

type ReportFilters = {
  owningUnit?: string;
  channelId?: number;
  startDate?: string;
  endDate?: string;
};

function parseIsoDate(s: string): string | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

function parseFilters(req: Request): ReportFilters | { error: string } {
  const f: ReportFilters = {};
  const ou = req.query.owningUnit;
  if (typeof ou === "string" && ou.trim()) f.owningUnit = ou.trim();
  const ch = req.query.channelId;
  if (typeof ch === "string" && ch.trim()) {
    const n = parseInt(ch, 10);
    if (!Number.isFinite(n)) return { error: "Invalid channelId" };
    f.channelId = n;
  }
  const sd = req.query.startDate;
  if (typeof sd === "string" && sd.trim()) {
    const parsed = parseIsoDate(sd.trim());
    if (!parsed) return { error: "Invalid startDate (expected YYYY-MM-DD)" };
    f.startDate = parsed;
  }
  const ed = req.query.endDate;
  if (typeof ed === "string" && ed.trim()) {
    const parsed = parseIsoDate(ed.trim());
    if (!parsed) return { error: "Invalid endDate (expected YYYY-MM-DD)" };
    f.endDate = parsed;
  }
  if (f.startDate && f.endDate && f.startDate > f.endDate) {
    return { error: "startDate must be on or before endDate" };
  }
  return f;
}

function whereClauses(f: ReportFilters, opts: { upcomingOnly?: boolean } = {}): SQL {
  const parts: SQL[] = [
    sql`${touchpointsTable.isSeed} = false`,
    sql`${campaignsTable.status} <> 'voided'`,
  ];
  if (opts.upcomingOnly) parts.push(sql`${touchpointsTable.sendDate} >= CURRENT_DATE`);
  if (f.owningUnit) parts.push(sql`${campaignsTable.owningUnit} = ${f.owningUnit}`);
  if (f.channelId !== undefined) parts.push(sql`${touchpointsTable.channelId} = ${f.channelId}`);
  if (f.startDate) parts.push(sql`${touchpointsTable.sendDate} >= ${f.startDate}::date`);
  if (f.endDate) parts.push(sql`${touchpointsTable.sendDate} <= ${f.endDate}::date`);
  return sql.join(parts, sql` AND `);
}

router.get("/reports/dashboard", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = parseFilters(req);
  if ("error" in parsed) { res.status(400).json({ message: parsed.error }); return; }
  const f = parsed;
  const whereTp = whereClauses(f);

  const [tpTotals] = await db
    .select({
      totalDonors: sql<number>`count(distinct ${touchpointsTable.donorId})::int`,
      totalTouchpoints: sql<number>`count(*)::int`,
    })
    .from(touchpointsTable)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereTp);

  // Total campaigns: respect owningUnit filter; date/channel filters don't restrict campaign count
  const campaignWhere = sql.join(
    [sql`${campaignsTable.status} <> 'voided'`, ...(f.owningUnit ? [sql`${campaignsTable.owningUnit} = ${f.owningUnit}`] : [])],
    sql` AND `,
  );
  const [campTotals] = await db
    .select({ totalCampaigns: sql<number>`count(*)::int` })
    .from(campaignsTable)
    .where(campaignWhere);

  const byChannel = await db
    .select({
      label: channelsTable.name,
      count: sql<number>`count(${touchpointsTable.id})::int`,
    })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereTp)
    .groupBy(channelsTable.name);
  const byType = await db
    .select({
      label: campaignTypesTable.name,
      count: sql<number>`count(${touchpointsTable.id})::int`,
    })
    .from(touchpointsTable)
    .innerJoin(
      campaignTypesTable,
      sql`${touchpointsTable.campaignTypeId} = ${campaignTypesTable.id}`,
    )
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereTp)
    .groupBy(campaignTypesTable.name);

  const recent = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(campaignWhere)
    .orderBy(desc(campaignsTable.createdAt))
    .limit(8);
  const recentSummaries = (await Promise.all(recent.map((r) => loadCampaignSummary(r.id)))).filter(
    Boolean,
  );
  res.json({
    totalCampaigns: campTotals?.totalCampaigns ?? 0,
    totalDonorsProcessed: tpTotals?.totalDonors ?? 0,
    totalTouchpoints: tpTotals?.totalTouchpoints ?? 0,
    byChannel,
    byType,
    recentCampaigns: recentSummaries,
  });
});

router.get("/reports/upcoming-volume", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = parseFilters(req);
  if ("error" in parsed) { res.status(400).json({ message: parsed.error }); return; }
  const f = parsed;
  const rows = await db
    .select({
      sendDate: touchpointsTable.sendDate,
      channelLabel: channelsTable.name,
      touchpointCount: sql<number>`count(*)::int`,
      campaignCount: sql<number>`count(distinct ${touchpointsTable.campaignId})::int`,
    })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereClauses(f, { upcomingOnly: !f.startDate }))
    .groupBy(touchpointsTable.sendDate, channelsTable.name)
    .orderBy(touchpointsTable.sendDate);
  res.json(
    rows.map((r) => ({
      sendDate:
        typeof r.sendDate === "string" ? r.sendDate : (r.sendDate as Date).toISOString().slice(0, 10),
      channelLabel: r.channelLabel,
      touchpointCount: r.touchpointCount,
      campaignCount: r.campaignCount,
    })),
  );
});

router.get("/reports/high-volume-donors", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const parsed = parseFilters(req);
  if ("error" in parsed) { res.status(400).json({ message: parsed.error }); return; }
  const f = parsed;
  const minRaw = req.query.minTouchpoints;
  const min = typeof minRaw === "string" ? parseInt(minRaw, 10) : 5;
  const minVal = Number.isFinite(min) ? min : 5;
  const whereTp = whereClauses(f);

  const totals = await db
    .select({
      donorId: touchpointsTable.donorId,
      total: sql<number>`count(*)::int`,
    })
    .from(touchpointsTable)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereTp)
    .groupBy(touchpointsTable.donorId)
    .having(sql`count(*) >= ${minVal}`)
    .orderBy(sql`count(*) desc`)
    .limit(200);
  const channelBreakdown = await db
    .select({
      donorId: touchpointsTable.donorId,
      label: channelsTable.name,
      count: sql<number>`count(*)::int`,
    })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignsTable, sql`${touchpointsTable.campaignId} = ${campaignsTable.id}`)
    .where(whereTp)
    .groupBy(touchpointsTable.donorId, channelsTable.name);
  const map = new Map<string, { label: string; count: number }[]>();
  for (const r of channelBreakdown) {
    const arr = map.get(r.donorId) ?? [];
    arr.push({ label: r.label, count: r.count });
    map.set(r.donorId, arr);
  }
  res.json(
    totals.map((t) => ({
      donorId: t.donorId,
      totalTouchpoints: t.total,
      byChannel: map.get(t.donorId) ?? [],
    })),
  );
});

router.get("/reports/upload-history", requireRole("admin", "super_admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: uploadJobsTable.id,
      campaignId: uploadJobsTable.campaignId,
      campaignName: campaignsTable.name,
      uploadedByName: usersTable.name,
      uploadedAt: uploadJobsTable.uploadedAt,
      source: uploadJobsTable.source,
      validCount: uploadJobsTable.validCount,
      rejectedCount: uploadJobsTable.rejectedCount,
    })
    .from(uploadJobsTable)
    .innerJoin(campaignsTable, sql`${uploadJobsTable.campaignId} = ${campaignsTable.id}`)
    .innerJoin(usersTable, sql`${uploadJobsTable.uploadedByUserId} = ${usersTable.id}`)
    .orderBy(desc(uploadJobsTable.uploadedAt))
    .limit(200);
  res.json(rows.map((r) => ({ ...r, uploadedAt: r.uploadedAt.toISOString() })));
});

router.get("/reports/export-history", requireRole("admin", "super_admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: exportJobsTable.id,
      campaignId: exportJobsTable.campaignId,
      campaignName: campaignsTable.name,
      exportedByName: usersTable.name,
      exportedAt: exportJobsTable.exportedAt,
      touchId: exportJobsTable.touchId,
      fileName: exportJobsTable.fileName,
      rowCount: exportJobsTable.rowCount,
      seedCount: exportJobsTable.seedCount,
      suppressedCount: exportJobsTable.suppressedCount,
    })
    .from(exportJobsTable)
    .innerJoin(campaignsTable, sql`${exportJobsTable.campaignId} = ${campaignsTable.id}`)
    .innerJoin(usersTable, sql`${exportJobsTable.exportedByUserId} = ${usersTable.id}`)
    .orderBy(desc(exportJobsTable.exportedAt))
    .limit(200);
  res.json(rows.map((r) => ({ ...r, exportedAt: r.exportedAt.toISOString() })));
});

export default router;
