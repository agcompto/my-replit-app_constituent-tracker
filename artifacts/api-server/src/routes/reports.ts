import { Router, type IRouter } from "express";
import { desc, sql } from "drizzle-orm";
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

router.get("/reports/dashboard", requireRole("admin", "super_admin"), async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalCampaigns: sql<number>`(select count(*)::int from ${campaignsTable})`,
      totalDonors: sql<number>`(select count(distinct donor_id)::int from ${touchpointsTable} where is_seed = false)`,
      totalTouchpoints: sql<number>`(select count(*)::int from ${touchpointsTable} where is_seed = false)`,
    })
    .from(sql`(select 1) t`);
  const byChannel = await db
    .select({
      label: channelsTable.name,
      count: sql<number>`count(${touchpointsTable.id})::int`,
    })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .where(sql`${touchpointsTable.isSeed} = false`)
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
    .where(sql`${touchpointsTable.isSeed} = false`)
    .groupBy(campaignTypesTable.name);
  const recent = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .orderBy(desc(campaignsTable.createdAt))
    .limit(8);
  const recentSummaries = (await Promise.all(recent.map((r) => loadCampaignSummary(r.id)))).filter(
    Boolean,
  );
  res.json({
    totalCampaigns: totals?.totalCampaigns ?? 0,
    totalDonorsProcessed: totals?.totalDonors ?? 0,
    totalTouchpoints: totals?.totalTouchpoints ?? 0,
    byChannel,
    byType,
    recentCampaigns: recentSummaries,
  });
});

router.get("/reports/upcoming-volume", requireRole("admin", "super_admin"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      sendDate: touchpointsTable.sendDate,
      channelLabel: channelsTable.name,
      touchpointCount: sql<number>`count(*)::int`,
      campaignCount: sql<number>`count(distinct ${touchpointsTable.campaignId})::int`,
    })
    .from(touchpointsTable)
    .innerJoin(channelsTable, sql`${touchpointsTable.channelId} = ${channelsTable.id}`)
    .where(sql`${touchpointsTable.sendDate} >= CURRENT_DATE AND ${touchpointsTable.isSeed} = false`)
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
  const minRaw = req.query.minTouchpoints;
  const min = typeof minRaw === "string" ? parseInt(minRaw, 10) : 5;
  const minVal = Number.isFinite(min) ? min : 5;
  const totals = await db
    .select({
      donorId: touchpointsTable.donorId,
      total: sql<number>`count(*)::int`,
    })
    .from(touchpointsTable)
    .where(sql`${touchpointsTable.isSeed} = false`)
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
    .where(sql`${touchpointsTable.isSeed} = false`)
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
