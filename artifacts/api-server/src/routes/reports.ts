import { Router, type IRouter, type Request } from "express";
import { desc, sql, inArray, type SQL } from "drizzle-orm";
import {
  db,
  touchpointsTable,
  campaignsTable,
  channelsTable,
  campaignTypesTable,
  campaignTypeLinksTable,
  touchesTable,
  uploadJobsTable,
  exportJobsTable,
  usersTable,
} from "@workspace/db";
import { requireRole, requireAuth } from "../lib/auth";
import { loadCampaignSummary } from "../lib/campaigns";
import { computeSaturation } from "../lib/saturation";
import { computeYoyVolume } from "../lib/yoy";
import { computeThresholdConflicts, getCampaignTouchesForPreview, getEffectiveAudienceByTouch, getHistoricalTouchpoints, getOverrides, getThresholds, type ThresholdRule } from "../lib/threshold";

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

router.get("/reports/cohort-analysis", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const monthsRaw = req.query.months;
  let months = typeof monthsRaw === "string" ? parseInt(monthsRaw, 10) : 6;
  if (!Number.isFinite(months) || months < 1) months = 6;
  if (months > 36) months = 36;

  const ouRaw = req.query.owningUnit;
  const owningUnit = typeof ouRaw === "string" && ouRaw.trim() ? ouRaw.trim() : undefined;
  const chRaw = req.query.channelId;
  let channelId: number | undefined;
  if (typeof chRaw === "string" && chRaw.trim()) {
    const n = parseInt(chRaw, 10);
    if (!Number.isFinite(n)) { res.status(400).json({ message: "Invalid channelId" }); return; }
    channelId = n;
  }

  const filterParts: SQL[] = [
    sql`${touchpointsTable.isSeed} = false`,
    sql`${campaignsTable.status} <> 'voided'`,
  ];
  if (owningUnit) filterParts.push(sql`${campaignsTable.owningUnit} = ${owningUnit}`);
  if (channelId !== undefined) filterParts.push(sql`${touchpointsTable.channelId} = ${channelId}`);
  const filterSql = sql.join(filterParts, sql` AND `);

  // First-touch month per donor → cohort assignment
  const rows = await db.execute<{
    cohort_month: string;
    cohort_size: number;
    total_touchpoints: number;
  }>(sql`
    WITH first_touch AS (
      SELECT
        ${touchpointsTable.donorId} AS donor_id,
        MIN(${touchpointsTable.sendDate}) AS first_send
      FROM ${touchpointsTable}
      INNER JOIN ${campaignsTable}
        ON ${touchpointsTable.campaignId} = ${campaignsTable.id}
      WHERE ${filterSql}
      GROUP BY ${touchpointsTable.donorId}
    ),
    cohorted AS (
      SELECT
        donor_id,
        first_send,
        DATE_TRUNC('month', first_send)::date AS cohort_start
      FROM first_touch
    )
    SELECT
      to_char(c.cohort_start, 'YYYY-MM') AS cohort_month,
      COUNT(DISTINCT c.donor_id)::int AS cohort_size,
      COUNT(${touchpointsTable.id})::int AS total_touchpoints
    FROM cohorted c
    INNER JOIN ${touchpointsTable}
      ON ${touchpointsTable.donorId} = c.donor_id
     AND ${touchpointsTable.sendDate} >= c.first_send
     AND ${touchpointsTable.sendDate} < (c.cohort_start + (${months}::int || ' months')::interval)::date
    INNER JOIN ${campaignsTable}
      ON ${touchpointsTable.campaignId} = ${campaignsTable.id}
    WHERE ${filterSql}
    GROUP BY c.cohort_start
    ORDER BY c.cohort_start DESC
    LIMIT 24
  `);

  const cohorts = (rows.rows ?? []).map((r) => ({
    cohortMonth: r.cohort_month,
    cohortSize: Number(r.cohort_size) || 0,
    totalTouchpoints: Number(r.total_touchpoints) || 0,
    avgTouchpointsPerDonor:
      Number(r.cohort_size) > 0
        ? Number((Number(r.total_touchpoints) / Number(r.cohort_size)).toFixed(2))
        : 0,
  }));

  res.json({ generatedAt: new Date().toISOString(), months, cohorts });
});

router.get("/reports/yoy-volume", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  const cs = req.query.currentStart;
  const ce = req.query.currentEnd;
  if (typeof cs !== "string" || typeof ce !== "string") {
    res.status(400).json({ message: "currentStart and currentEnd are required" });
    return;
  }
  const currentStart = parseIsoDate(cs);
  const currentEnd = parseIsoDate(ce);
  if (!currentStart || !currentEnd) {
    res.status(400).json({ message: "Invalid date (expected YYYY-MM-DD)" });
    return;
  }
  if (currentStart > currentEnd) {
    res.status(400).json({ message: "currentStart must be on or before currentEnd" });
    return;
  }
  const ps = req.query.priorStart;
  const pe = req.query.priorEnd;
  let priorStart: string | undefined;
  let priorEnd: string | undefined;
  if (typeof ps === "string" && typeof pe === "string") {
    const a = parseIsoDate(ps), b = parseIsoDate(pe);
    if (!a || !b) { res.status(400).json({ message: "Invalid prior date" }); return; }
    if (a > b) { res.status(400).json({ message: "priorStart must be on or before priorEnd" }); return; }
    priorStart = a; priorEnd = b;
  }

  const ouRaw = req.query.owningUnit;
  const owningUnit = typeof ouRaw === "string" && ouRaw.trim() ? ouRaw.trim() : undefined;
  const chRaw = req.query.channelId;
  let channelId: number | undefined;
  if (typeof chRaw === "string" && chRaw.trim()) {
    const n = parseInt(chRaw, 10);
    if (!Number.isFinite(n)) { res.status(400).json({ message: "Invalid channelId" }); return; }
    channelId = n;
  }

  const result = await computeYoyVolume({
    currentStart,
    currentEnd,
    priorStart,
    priorEnd,
    owningUnit,
    channelId,
  });
  res.json({ generatedAt: new Date().toISOString(), ...result });
});

router.get("/reports/saturation", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  let weeks = 12;
  const wRaw = req.query.weeks;
  if (typeof wRaw === "string" && wRaw.trim()) {
    const n = parseInt(wRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 26) {
      res.status(400).json({ message: "weeks must be an integer between 1 and 26" });
      return;
    }
    weeks = n;
  }
  let start: string | undefined;
  const sRaw = req.query.start;
  if (typeof sRaw === "string" && sRaw.trim()) {
    const parsed = parseIsoDate(sRaw.trim());
    if (!parsed) { res.status(400).json({ message: "Invalid start (expected YYYY-MM-DD)" }); return; }
    start = parsed;
  }
  const ouRaw = req.query.owningUnit;
  const owningUnit = typeof ouRaw === "string" && ouRaw.trim() ? ouRaw.trim() : undefined;
  const chRaw = req.query.channelId;
  let channelId: number | undefined;
  if (typeof chRaw === "string" && chRaw.trim()) {
    const n = parseInt(chRaw, 10);
    if (!Number.isFinite(n)) { res.status(400).json({ message: "Invalid channelId" }); return; }
    channelId = n;
  }
  const report = await computeSaturation({ weeks, start, owningUnit, channelId });
  res.json(report);
});

router.get("/reports/saturation", requireRole("admin", "super_admin"), async (req, res): Promise<void> => {
  let weeks = 12;
  const wRaw = req.query.weeks;
  if (typeof wRaw === "string" && wRaw.trim()) {
    const n = parseInt(wRaw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 26) {
      res.status(400).json({ message: "weeks must be an integer between 1 and 26" });
      return;
    }
    weeks = n;
  }
  let start: string | undefined;
  const sRaw = req.query.start;
  if (typeof sRaw === "string" && sRaw.trim()) {
    const parsed = parseIsoDate(sRaw.trim());
    if (!parsed) { res.status(400).json({ message: "Invalid start (expected YYYY-MM-DD)" }); return; }
    start = parsed;
  }
  const ouRaw = req.query.owningUnit;
  const owningUnit = typeof ouRaw === "string" && ouRaw.trim() ? ouRaw.trim() : undefined;
  const chRaw = req.query.channelId;
  let channelId: number | undefined;
  if (typeof chRaw === "string" && chRaw.trim()) {
    const n = parseInt(chRaw, 10);
    if (!Number.isFinite(n)) { res.status(400).json({ message: "Invalid channelId" }); return; }
    channelId = n;
  }
  const report = await computeSaturation({ weeks, start, owningUnit, channelId });
  res.json(report);
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

router.get("/reports/calendar", requireAuth, async (req, res): Promise<void> => {
  const sd = req.query.startDate;
  const ed = req.query.endDate;
  if (typeof sd !== "string" || typeof ed !== "string") {
    res.status(400).json({ message: "startDate and endDate are required" });
    return;
  }
  const startDate = parseIsoDate(sd.trim());
  const endDate = parseIsoDate(ed.trim());
  if (!startDate || !endDate) {
    res.status(400).json({ message: "Invalid date (expected YYYY-MM-DD)" });
    return;
  }
  if (startDate > endDate) {
    res.status(400).json({ message: "startDate must be on or before endDate" });
    return;
  }
  // Cap to 92-day window
  const ta = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  const tb = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10));
  if ((tb - ta) / 86400000 > 92) {
    res.status(400).json({ message: "Date range cannot exceed 92 days" });
    return;
  }

  // Optional filters
  const ouRaw = req.query.owningUnit;
  const owningUnit = typeof ouRaw === "string" && ouRaw.trim() ? ouRaw.trim() : undefined;

  const channelIds: number[] = [];
  const chRaw = req.query.channelId;
  if (Array.isArray(chRaw)) {
    for (const c of chRaw) {
      const n = parseInt(String(c), 10);
      if (Number.isFinite(n)) channelIds.push(n);
    }
  } else if (typeof chRaw === "string" && chRaw.trim()) {
    const n = parseInt(chRaw.trim(), 10);
    if (Number.isFinite(n)) channelIds.push(n);
  }

  const campaignTypeIds: number[] = [];
  const ctRaw = req.query.campaignTypeId;
  if (Array.isArray(ctRaw)) {
    for (const c of ctRaw) {
      const n = parseInt(String(c), 10);
      if (Number.isFinite(n)) campaignTypeIds.push(n);
    }
  } else if (typeof ctRaw === "string" && ctRaw.trim()) {
    const n = parseInt(ctRaw.trim(), 10);
    if (Number.isFinite(n)) campaignTypeIds.push(n);
  }

  const statuses: string[] = [];
  const stRaw = req.query.status;
  if (Array.isArray(stRaw)) {
    for (const s of stRaw) statuses.push(String(s));
  } else if (typeof stRaw === "string" && stRaw.trim()) {
    statuses.push(stRaw.trim());
  }

  const mine = req.query.mine === "true" || req.query.mine === "1";
  const nameContainsRaw = req.query.nameContains;
  const nameContains = typeof nameContainsRaw === "string" && nameContainsRaw.trim()
    ? nameContainsRaw.trim().toLowerCase()
    : undefined;

  // Build WHERE for the touch+campaign join
  const whereParts: SQL[] = [
    sql`${touchesTable.sendDate} >= ${startDate}::date`,
    sql`${touchesTable.sendDate} <= ${endDate}::date`,
    sql`${campaignsTable.status} <> 'voided'`,
  ];
  if (owningUnit) whereParts.push(sql`${campaignsTable.owningUnit} = ${owningUnit}`);
  if (channelIds.length > 0) whereParts.push(sql`${touchesTable.channelId} = ANY(ARRAY[${sql.join(channelIds.map((id) => sql`${id}`), sql`, `)}]::int[])`);
  if (campaignTypeIds.length > 0) whereParts.push(sql`${touchesTable.campaignTypeId} = ANY(ARRAY[${sql.join(campaignTypeIds.map((id) => sql`${id}`), sql`, `)}]::int[])`);
  if (statuses.length > 0) whereParts.push(sql`${campaignsTable.status} = ANY(ARRAY[${sql.join(statuses.map((s) => sql`${s}`), sql`, `)}])`);
  if (mine) whereParts.push(sql`${campaignsTable.submittedByUserId} = ${req.currentUser!.id}`);
  if (nameContains) whereParts.push(sql`LOWER(${campaignsTable.name}) LIKE ${"%" + nameContains + "%"}`);

  const where = sql.join(whereParts, sql` AND `);

  const rows = await db
    .select({
      touchId: touchesTable.id,
      touchName: touchesTable.touchName,
      sendDate: touchesTable.sendDate,
      audienceMode: touchesTable.audienceMode,
      customUniqueIdCount: touchesTable.customUniqueIdCount,
      campaignId: campaignsTable.id,
      campaignName: campaignsTable.name,
      campaignStatus: campaignsTable.status,
      owningUnit: campaignsTable.owningUnit,
      submittedByUserId: campaignsTable.submittedByUserId,
      campaignUniqueIdCount: campaignsTable.uniqueIdCount,
      channelId: channelsTable.id,
      channelLabel: channelsTable.name,
      campaignTypeId: campaignTypesTable.id,
      campaignTypeLabel: campaignTypesTable.name,
    })
    .from(touchesTable)
    .innerJoin(campaignsTable, sql`${touchesTable.campaignId} = ${campaignsTable.id}`)
    .innerJoin(channelsTable, sql`${touchesTable.channelId} = ${channelsTable.id}`)
    .innerJoin(campaignTypesTable, sql`${touchesTable.campaignTypeId} = ${campaignTypesTable.id}`)
    .where(where)
    .orderBy(touchesTable.sendDate, campaignsTable.name, touchesTable.touchName);

  // Get all campaign type labels for each campaign (a campaign can have multiple types)
  const campaignIdSet = [...new Set(rows.map((r) => r.campaignId))];
  const ctLabelMap = new Map<number, string[]>();
  if (campaignIdSet.length > 0) {
    const ctLinks = await db
      .select({
        campaignId: campaignTypeLinksTable.campaignId,
        typeName: campaignTypesTable.name,
      })
      .from(campaignTypeLinksTable)
      .innerJoin(
        campaignTypesTable,
        sql`${campaignTypeLinksTable.campaignTypeId} = ${campaignTypesTable.id}`,
      )
      .where(inArray(campaignTypeLinksTable.campaignId, campaignIdSet));
    for (const link of ctLinks) {
      const arr = ctLabelMap.get(link.campaignId) ?? [];
      arr.push(link.typeName);
      ctLabelMap.set(link.campaignId, arr);
    }
  }

  // ── Conflict computation ──────────────────────────────────────────────────
  // For campaigns with planned (not-yet-exported) touches that appear in the
  // requested window, compute threshold conflicts bounded to that window.
  // "Bounded to the window" means: only touches with sendDate in [startDate, endDate]
  // are treated as planned work; historical touchpoints (already-sent) still serve
  // as rolling-window context so the threshold arithmetic remains accurate.
  // This ensures the conflict overlay reflects what would happen if the user
  // executed the visible-range touches — not touches outside the viewed period.
  // No campaign-count cap is applied; the window naturally limits scope.
  const CONFLICT_COMPUTABLE_STATUSES = new Set(["uploaded", "previewed", "finalized"]);
  const campaignStatusMap = new Map<number, string>();
  for (const r of rows) campaignStatusMap.set(r.campaignId, r.campaignStatus);

  const conflictableCampaignIds = [...campaignStatusMap.entries()]
    .filter(([, status]) => CONFLICT_COMPUTABLE_STATUSES.has(status))
    .map(([id]) => id);

  // conflictDonorCount + sample per touch ID (in-window touches only).
  // `donors` holds the exact Set for server-side day aggregation; `sample` is the
  // capped slice returned to the client for the detail-sheet breakdown.
  const touchConflictMap = new Map<number, { count: number; sample: string[]; donors: Set<string> }>();
  // conflictDonorCount + sample per campaign ID
  const campaignConflictMap = new Map<number, { count: number; sample: string[] }>();

  if (conflictableCampaignIds.length > 0) {
    await Promise.all(
      conflictableCampaignIds.map(async (campaignId) => {
        try {
          // Quick gate: skip if campaign has no thresholds defined
          const thresholdRows = await getThresholds(campaignId);
          if (thresholdRows.length === 0) return;

          // Explicit mapping to ThresholdRule — avoids unsafe cast and validates
          // that all required fields are present before passing to the engine.
          const thresholdRules: ThresholdRule[] = thresholdRows.map((t) => ({
            id: t.id,
            name: t.name,
            scope: t.scope as ThresholdRule["scope"],
            channelId: t.channelId ?? null,
            campaignTypeId: t.campaignTypeId ?? null,
            windowDays: t.windowDays,
            maxTouchpoints: t.maxTouchpoints,
          }));

          // Bound to the calendar window: get all planned touches then keep only
          // those whose sendDate falls within [startDate, endDate].
          const allPlannedTouches = await getCampaignTouchesForPreview(campaignId);
          const windowTouches = allPlannedTouches.filter(
            (t) => t.sendDate >= startDate && t.sendDate <= endDate,
          );
          // If this campaign has no touches in the window, nothing to show
          if (windowTouches.length === 0) return;

          // Fetch audience, history, and overrides in parallel
          const [audienceByTouch, history, overrides] = await Promise.all([
            getEffectiveAudienceByTouch(campaignId, windowTouches),
            getHistoricalTouchpoints(campaignId),
            getOverrides(campaignId),
          ]);

          const preview = computeThresholdConflicts({
            planned: windowTouches,
            history,
            thresholds: thresholdRules,
            overrides,
            audienceByTouch,
          });
          if (preview.totalFlaggedDonors === 0) return;

          // Use the engine's per-touch attribution directly.
          // conflictsByTouchId[touchId] = exact set of donors that breach a threshold
          // in the rolling window centred on THAT touch's sendDate — not a campaign-global
          // projection that would incorrectly mark donors on every touch they appear in.
          for (const [touchId, donorSet] of preview.conflictsByTouchId) {
            const donorArray = [...donorSet];
            touchConflictMap.set(touchId, {
              count: donorArray.length,
              sample: donorArray.slice(0, 50),
              donors: donorSet,
            });
          }

          // Campaign-level summary: union of all per-touch conflict donor sets
          const allCampaignConflictedDonors = new Set<string>();
          for (const donorSet of preview.conflictsByTouchId.values()) {
            for (const d of donorSet) allCampaignConflictedDonors.add(d);
          }
          const campaignConflictArray = [...allCampaignConflictedDonors];
          campaignConflictMap.set(campaignId, {
            count: allCampaignConflictedDonors.size,
            sample: campaignConflictArray.slice(0, 50),
          });
        } catch (err) {
          // Log but do not fail the whole request — other campaigns render normally
          req.log.warn({ campaignId, err }, "calendar conflict computation failed for campaign");
        }
      }),
    );
  }

  // ── Exact server-side day conflict aggregation ────────────────────────────
  // Group the exact per-touch donor sets by sendDate to produce authoritative
  // per-day conflict counts AND per-campaign breakdowns for the detail sheet.
  // No sample-based approximation; donor sets are unioned exactly.
  type DayCampData = { donorSet: Set<string>; touches: Map<number, string> }; // touchId → touchName
  const dayConflictsAgg = new Map<string, {
    donorSet: Set<string>;
    campaignIds: Set<number>;
    byCampaign: Map<number, DayCampData>;
  }>();

  for (const r of rows) {
    const touchConflict = touchConflictMap.get(r.touchId);
    if (!touchConflict) continue;
    const sendStr =
      typeof r.sendDate === "string" ? r.sendDate : (r.sendDate as Date).toISOString().slice(0, 10);
    if (!dayConflictsAgg.has(sendStr)) {
      dayConflictsAgg.set(sendStr, { donorSet: new Set(), campaignIds: new Set(), byCampaign: new Map() });
    }
    const dayData = dayConflictsAgg.get(sendStr)!;
    for (const d of touchConflict.donors) dayData.donorSet.add(d);
    dayData.campaignIds.add(r.campaignId);

    // Per-campaign breakdown: union per-touch donor sets; track touchId → name
    if (!dayData.byCampaign.has(r.campaignId)) {
      dayData.byCampaign.set(r.campaignId, { donorSet: new Set(), touches: new Map() });
    }
    const campData = dayData.byCampaign.get(r.campaignId)!;
    for (const d of touchConflict.donors) campData.donorSet.add(d);
    campData.touches.set(r.touchId, r.touchName);
  }

  type ByCampaignEntry = {
    donorCount: number;
    donorSample: string[];
    overflow: number;
    touchBreakdown: Array<{ touchId: number; touchName: string; donorCount: number }>;
    donorTouchIds: Record<string, number[]>;
  };
  const dayConflictsObj: Record<string, {
    donorCount: number;
    campaignCount: number;
    byCampaign: Record<string, ByCampaignEntry>;
  }> = {};
  for (const [date, data] of dayConflictsAgg) {
    const byCampaign: Record<string, ByCampaignEntry> = {};
    for (const [campaignId, campData] of data.byCampaign) {
      const donorArray = [...campData.donorSet];
      const donorSample = donorArray.slice(0, 50);
      const touchBreakdown = [...campData.touches.entries()].map(([touchId, touchName]) => ({
        touchId,
        touchName,
        donorCount: touchConflictMap.get(touchId)?.count ?? 0,
      }));
      // donorTouchIds: for each sampled donor, which touch IDs caused their breach.
      // Derived from the exact per-touch donor sets — no approximation.
      const donorTouchIds: Record<string, number[]> = {};
      for (const donorId of donorSample) {
        const tids: number[] = [];
        for (const [touchId] of campData.touches) {
          if (touchConflictMap.get(touchId)?.donors.has(donorId)) tids.push(touchId);
        }
        if (tids.length > 0) donorTouchIds[donorId] = tids;
      }
      byCampaign[String(campaignId)] = {
        donorCount: campData.donorSet.size,
        donorSample,
        overflow: campData.donorSet.size - donorSample.length,
        touchBreakdown,
        donorTouchIds,
      };
    }
    dayConflictsObj[date] = {
      donorCount: data.donorSet.size,
      campaignCount: data.campaignIds.size,
      byCampaign,
    };
  }

  // ── Build response ────────────────────────────────────────────────────────
  // Slim payload: campaign metadata in a map, touches reference campaignId only
  const campaignsMap: Record<
    string,
    {
      name: string;
      status: string;
      owningUnit: string | null;
      submittedByUserId: number;
      campaignTypeLabels: string[];
      conflictDonorCount: number;
      conflictDonorSample: string[];
    }
  > = {};

  for (const r of rows) {
    const idStr = String(r.campaignId);
    if (!campaignsMap[idStr]) {
      const conflictInfo = campaignConflictMap.get(r.campaignId);
      campaignsMap[idStr] = {
        name: r.campaignName,
        status: r.campaignStatus,
        owningUnit: r.owningUnit ?? null,
        submittedByUserId: r.submittedByUserId,
        campaignTypeLabels: ctLabelMap.get(r.campaignId) ?? [r.campaignTypeLabel],
        conflictDonorCount: conflictInfo?.count ?? 0,
        conflictDonorSample: conflictInfo?.sample ?? [],
      };
    }
  }

  // dayVolumes: total audience per date for the sparkline
  const dayVolumeMap: Record<string, number> = {};

  const touches = rows.map((r) => {
    const audienceCount =
      r.audienceMode === "custom" ? r.customUniqueIdCount : r.campaignUniqueIdCount;
    const sendStr =
      typeof r.sendDate === "string" ? r.sendDate : (r.sendDate as Date).toISOString().slice(0, 10);

    // Accumulate dayVolumes
    dayVolumeMap[sendStr] = (dayVolumeMap[sendStr] ?? 0) + audienceCount;

    const touchConflict = touchConflictMap.get(r.touchId);
    return {
      touchId: r.touchId,
      touchName: r.touchName,
      sendDate: sendStr,
      campaignId: r.campaignId,
      channelId: r.channelId,
      channelLabel: r.channelLabel,
      campaignTypeLabel: r.campaignTypeLabel,
      audienceCount,
      conflictDonorCount: touchConflict?.count ?? 0,
      conflictDonorSample: touchConflict?.sample ?? [],
    };
  });

  res.json({ campaigns: campaignsMap, touches, dayVolumes: dayVolumeMap, dayConflicts: dayConflictsObj });
});

export default router;
