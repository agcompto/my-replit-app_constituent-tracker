import { Router, type IRouter } from "express";
import { eq, inArray, and, gte, lte } from "drizzle-orm";
import { db, touchpointsTable, campaignsTable, channelsTable, campaignTypesTable } from "@workspace/db";
import { requireAuth, audit } from "../lib/auth";
import { normalizeDonorId, buildCsv } from "../lib/donor";
import { checkExportQuota } from "../lib/rateLimit";

const router: IRouter = Router();

interface FilterParams {
  startDate?: string;
  endDate?: string;
  channelIds?: number[];
  campaignTypeIds?: number[];
  statuses?: string[];
  countsTowardThresholdOnly?: boolean;
}

function parseFilterParams(query: Record<string, unknown>): FilterParams {
  const startDate = typeof query.startDate === "string" ? query.startDate : undefined;
  const endDate = typeof query.endDate === "string" ? query.endDate : undefined;
  const countsTowardThresholdOnly =
    query.countsTowardThresholdOnly === "true"
      ? true
      : query.countsTowardThresholdOnly === "false"
        ? false
        : undefined;

  const channelIds = (() => {
    const raw = query.channelId;
    if (!raw) return undefined;
    const arr = Array.isArray(raw) ? raw : [raw];
    const nums = arr.map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n));
    return nums.length ? nums : undefined;
  })();

  const campaignTypeIds = (() => {
    const raw = query.campaignTypeId;
    if (!raw) return undefined;
    const arr = Array.isArray(raw) ? raw : [raw];
    const nums = arr.map((v) => parseInt(String(v), 10)).filter((n) => !isNaN(n));
    return nums.length ? nums : undefined;
  })();

  const statuses = (() => {
    const raw = query.status;
    if (!raw) return undefined;
    const arr = Array.isArray(raw) ? raw : [raw];
    const strs = arr.map(String).filter(Boolean);
    return strs.length ? strs : undefined;
  })();

  return { startDate, endDate, channelIds, campaignTypeIds, statuses, countsTowardThresholdOnly };
}

async function fetchTouchpoints(donorId: string, filters: FilterParams) {
  const conditions = [eq(touchpointsTable.donorId, donorId)];
  if (filters.startDate) conditions.push(gte(touchpointsTable.sendDate, filters.startDate as any));
  if (filters.endDate) conditions.push(lte(touchpointsTable.sendDate, filters.endDate as any));
  if (filters.channelIds?.length) conditions.push(inArray(touchpointsTable.channelId, filters.channelIds));
  if (filters.campaignTypeIds?.length) conditions.push(inArray(touchpointsTable.campaignTypeId, filters.campaignTypeIds));
  if (filters.countsTowardThresholdOnly === true) conditions.push(eq(touchpointsTable.countsTowardThreshold, true));

  const rows = await db
    .select()
    .from(touchpointsTable)
    .where(and(...conditions))
    .orderBy(touchpointsTable.sendDate);

  const [channels, types] = await Promise.all([
    db.select().from(channelsTable),
    db.select().from(campaignTypesTable),
  ]);

  const campaignIds = Array.from(new Set(rows.map((r) => r.campaignId)));
  const campaigns = campaignIds.length
    ? await db.select().from(campaignsTable).where(inArray(campaignsTable.id, campaignIds))
    : [];

  // Apply status filter (post-join since status is on campaigns, not touchpoints)
  const filteredRows = filters.statuses?.length
    ? rows.filter((r) => {
        const c = campaigns.find((x) => x.id === r.campaignId);
        const status = c?.status ?? "unknown";
        return filters.statuses!.includes(status);
      })
    : rows;

  return filteredRows.map((r) => {
    const c = campaigns.find((x) => x.id === r.campaignId);
    const ch = channels.find((x) => x.id === r.channelId);
    const tp = types.find((x) => x.id === r.campaignTypeId);
    const sendDate =
      typeof r.sendDate === "string" ? r.sendDate : (r.sendDate as Date).toISOString().slice(0, 10);
    return {
      campaignId: r.campaignId,
      campaignName: c?.name ?? `Campaign #${r.campaignId}`,
      campaignStatus: c?.status ?? "unknown",
      touchId: r.touchId,
      channelId: r.channelId,
      channelLabel: ch?.name ?? "Unknown",
      campaignTypeId: r.campaignTypeId,
      campaignTypeLabel: tp?.name ?? "Unknown",
      sendDate,
      countsTowardThreshold: r.countsTowardThreshold,
    };
  });
}

router.get("/donors/:donorId/touchpoints", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId;
  const donorId = normalizeDonorId(raw);
  if (!donorId) {
    res.status(400).json({ error: "Constituent ID must be 1-8 digits" });
    return;
  }
  const filters = parseFilterParams(req.query as Record<string, unknown>);
  const touchpoints = await fetchTouchpoints(donorId, filters);
  res.json({ donorId, touchpoints });
});

router.get("/donors/:donorId/touchpoints/summary", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId;
  const donorId = normalizeDonorId(raw);
  if (!donorId) {
    res.status(400).json({ error: "Constituent ID must be 1-8 digits" });
    return;
  }
  const filters = parseFilterParams(req.query as Record<string, unknown>);
  const touchpoints = await fetchTouchpoints(donorId, filters);

  const total = touchpoints.length;

  // By channel
  const channelMap = new Map<number, { label: string; count: number }>();
  for (const t of touchpoints) {
    const existing = channelMap.get(t.channelId);
    if (existing) {
      existing.count++;
    } else {
      channelMap.set(t.channelId, { label: t.channelLabel, count: 1 });
    }
  }
  const byChannel = Array.from(channelMap.entries()).map(([channelId, { label, count }]) => ({
    channelId,
    label,
    count,
    percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  }));

  // By campaign type
  const typeMap = new Map<number, { label: string; count: number }>();
  for (const t of touchpoints) {
    const existing = typeMap.get(t.campaignTypeId);
    if (existing) {
      existing.count++;
    } else {
      typeMap.set(t.campaignTypeId, { label: t.campaignTypeLabel, count: 1 });
    }
  }
  const byCampaignType = Array.from(typeMap.entries()).map(([campaignTypeId, { label, count }]) => ({
    campaignTypeId,
    label,
    count,
  }));

  // Dates and longest gap
  const sortedDates = touchpoints.map((t) => t.sendDate).sort();
  const earliestDate = sortedDates[0] ?? null;
  const mostRecentDate = sortedDates[sortedDates.length - 1] ?? null;

  let longestGapDays: number | null = null;
  if (sortedDates.length >= 2) {
    for (let i = 1; i < sortedDates.length; i++) {
      const a = Date.UTC(
        +sortedDates[i - 1].slice(0, 4),
        +sortedDates[i - 1].slice(5, 7) - 1,
        +sortedDates[i - 1].slice(8, 10),
      );
      const b = Date.UTC(
        +sortedDates[i].slice(0, 4),
        +sortedDates[i].slice(5, 7) - 1,
        +sortedDates[i].slice(8, 10),
      );
      const gap = Math.round((b - a) / 86400000);
      if (longestGapDays === null || gap > longestGapDays) longestGapDays = gap;
    }
  }

  res.json({ total, byChannel, byCampaignType, longestGapDays, mostRecentDate, earliestDate });
});

router.get("/donors/:donorId/touchpoints/export.csv", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId;
  const donorId = normalizeDonorId(raw);
  if (!donorId) {
    res.status(400).json({ error: "Constituent ID must be 1-8 digits" });
    return;
  }

  const quota = checkExportQuota(req.currentUser!.id);
  if (!quota.allowed) {
    res
      .status(429)
      .setHeader("Retry-After", String(quota.retryAfterSec))
      .json({
        error: `Export quota reached. Try again in ${Math.ceil(quota.retryAfterSec / 60)} minutes.`,
        code: "export_quota_exceeded",
      });
    return;
  }

  const filters = parseFilterParams(req.query as Record<string, unknown>);
  const touchpoints = await fetchTouchpoints(donorId, filters);

  await audit({
    actor: req.currentUser!,
    action: "donor_touchpoints_export",
    entityType: "donor",
    details: `Exported ${touchpoints.length} touchpoints for donor ${donorId}`,
  });

  const headers = [
    "constituent_id",
    "send_date",
    "channel",
    "campaign_type",
    "campaign_name",
    "campaign_status",
    "counts_toward_threshold",
  ];
  const rows = touchpoints.map((t) => [
    `="${donorId}"`,
    t.sendDate,
    t.channelLabel,
    t.campaignTypeLabel,
    t.campaignName,
    t.campaignStatus,
    t.countsTowardThreshold ? "Yes" : "No",
  ]);

  const csv = "\uFEFF" + buildCsv(headers, rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="donor_${donorId}_touchpoints.csv"`,
  );
  res.send(csv);
});

export default router;
