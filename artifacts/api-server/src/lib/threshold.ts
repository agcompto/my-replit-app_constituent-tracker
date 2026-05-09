import { db, touchesTable, touchpointsTable, audienceDonorsTable, suppressionsTable, seedGroupsTable, thresholdsTable, thresholdOverridesTable, channelsTable, campaignTypesTable, campaignsTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";

export interface PlannedTouch {
  id: number;
  channelId: number;
  campaignTypeId: number;
  sendDate: string; // YYYY-MM-DD
  channelLabel: string;
  campaignTypeLabel: string;
  touchName: string;
}

interface HistoryRow {
  donorId: string;
  channelId: number;
  campaignTypeId: number;
  sendDate: string;
}

function toISO(d: Date | string): string {
  if (typeof d === "string") return d.length >= 10 ? d.slice(0, 10) : d;
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.abs((ta - tb) / 86400000);
}

export async function getCampaignTouchesForPreview(campaignId: number): Promise<PlannedTouch[]> {
  const rows = await db
    .select()
    .from(touchesTable)
    .where(eq(touchesTable.campaignId, campaignId))
    .orderBy(touchesTable.sendDate);
  if (rows.length === 0) return [];
  const channels = await db.select().from(channelsTable);
  const types = await db.select().from(campaignTypesTable);
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    campaignTypeId: r.campaignTypeId,
    sendDate: toISO(r.sendDate as unknown as string),
    channelLabel: channels.find((c) => c.id === r.channelId)?.name ?? "Unknown",
    campaignTypeLabel: types.find((t) => t.id === r.campaignTypeId)?.name ?? "Unknown",
    touchName: r.touchName,
  }));
}

export async function getCampaignAudience(campaignId: number): Promise<string[]> {
  const rows = await db
    .select({ donorId: audienceDonorsTable.donorId })
    .from(audienceDonorsTable)
    .where(eq(audienceDonorsTable.campaignId, campaignId));
  return rows.map((r) => r.donorId);
}

export async function getHistoricalTouchpoints(
  excludeCampaignId: number,
): Promise<HistoryRow[]> {
  // Exported / Sent + Archived count toward thresholds.
  // Exclude voided campaigns.
  const eligible = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(
      and(
        ne(campaignsTable.id, excludeCampaignId),
        ne(campaignsTable.status, "voided"),
        ne(campaignsTable.status, "draft"),
        ne(campaignsTable.status, "uploaded"),
        ne(campaignsTable.status, "previewed"),
        ne(campaignsTable.status, "finalized"),
      ),
    );
  if (eligible.length === 0) return [];
  const ids = eligible.map((e) => e.id);
  const rows = await db
    .select({
      donorId: touchpointsTable.donorId,
      channelId: touchpointsTable.channelId,
      campaignTypeId: touchpointsTable.campaignTypeId,
      sendDate: touchpointsTable.sendDate,
      isSeed: touchpointsTable.isSeed,
      counts: touchpointsTable.countsTowardThreshold,
    })
    .from(touchpointsTable)
    .where(inArray(touchpointsTable.campaignId, ids));
  return rows
    .filter((r) => r.counts && !r.isSeed)
    .map((r) => ({
      donorId: r.donorId,
      channelId: r.channelId,
      campaignTypeId: r.campaignTypeId,
      sendDate: toISO(r.sendDate as unknown as string),
    }));
}

export async function getOverrides(campaignId: number): Promise<Set<string>> {
  const rows = await db
    .select({ donorId: thresholdOverridesTable.donorId })
    .from(thresholdOverridesTable)
    .where(eq(thresholdOverridesTable.campaignId, campaignId));
  return new Set(rows.map((r) => r.donorId));
}

export async function getThresholds(campaignId: number) {
  return db.select().from(thresholdsTable).where(eq(thresholdsTable.campaignId, campaignId));
}

export async function getSuppressionsForCampaign(campaignId: number) {
  return db.select().from(suppressionsTable).where(eq(suppressionsTable.campaignId, campaignId));
}

export async function getSeedGroupsForCampaign(campaignId: number) {
  return db.select().from(seedGroupsTable).where(eq(seedGroupsTable.campaignId, campaignId));
}

interface ConflictAccum {
  donorId: string;
  thresholdId: number;
  thresholdName: string;
  projectedCount: number;
  maxAllowed: number;
  windowDays: number;
  explanation: string;
}

export interface PreviewOutput {
  conflicts: Array<ConflictAccum & { overridden: boolean }>;
  totalFlaggedDonors: number;
  totalProjectedTouchpoints: number;
  byThreshold: Array<{ thresholdId: number; thresholdName: string; flaggedCount: number }>;
}

export async function computeThresholdPreview(campaignId: number): Promise<PreviewOutput> {
  const [audience, planned, history, thresholds, overrides] = await Promise.all([
    getCampaignAudience(campaignId),
    getCampaignTouchesForPreview(campaignId),
    getHistoricalTouchpoints(campaignId),
    getThresholds(campaignId),
    getOverrides(campaignId),
  ]);

  const audienceSet = new Set(audience);
  const conflicts: Array<ConflictAccum & { overridden: boolean }> = [];
  const byThreshold = new Map<number, { name: string; flagged: Set<string> }>();
  const flaggedDonors = new Set<string>();
  let totalProjected = 0;

  for (const t of thresholds) {
    byThreshold.set(t.id, { name: t.name, flagged: new Set() });
  }

  // Build per-donor combined timeline
  const perDonorEvents = new Map<string, Array<{ sendDate: string; channelId: number; campaignTypeId: number; isPlanned: boolean }>>();
  for (const h of history) {
    if (!audienceSet.has(h.donorId)) continue;
    const arr = perDonorEvents.get(h.donorId) ?? [];
    arr.push({ sendDate: h.sendDate, channelId: h.channelId, campaignTypeId: h.campaignTypeId, isPlanned: false });
    perDonorEvents.set(h.donorId, arr);
  }
  for (const donorId of audienceSet) {
    const arr = perDonorEvents.get(donorId) ?? [];
    for (const p of planned) {
      arr.push({ sendDate: p.sendDate, channelId: p.channelId, campaignTypeId: p.campaignTypeId, isPlanned: true });
    }
    perDonorEvents.set(donorId, arr);
    totalProjected += planned.length;
  }

  for (const [donorId, events] of perDonorEvents) {
    for (const t of thresholds) {
      // Filter events by scope
      const filtered = events.filter((e) => {
        if (t.scope === "channel") return e.channelId === t.channelId;
        if (t.scope === "campaign_type") return e.campaignTypeId === t.campaignTypeId;
        if (t.scope === "channel_and_type")
          return e.channelId === t.channelId && e.campaignTypeId === t.campaignTypeId;
        return true; // all
      });
      if (filtered.length === 0) continue;
      // For each planned event, compute the window centered (or rolling) — use rolling window: count events within (windowDays-1) before to (windowDays-1) after this date
      // Simpler: for each pair of dates, if diff < windowDays, they're in same rolling window.
      // We'll compute the max count of events in any windowDays-day rolling window that contains a planned send date.
      for (const planned of filtered.filter((e) => e.isPlanned)) {
        const inWindow = filtered.filter((e) => diffDays(e.sendDate, planned.sendDate) < t.windowDays);
        if (inWindow.length > t.maxTouchpoints) {
          const explanation = `${inWindow.length} touchpoints projected in ${t.windowDays}-day window (max ${t.maxTouchpoints}) for ${t.scope === "all" ? "all communications" : t.scope.replace("_", " ")}.`;
          conflicts.push({
            donorId,
            thresholdId: t.id,
            thresholdName: t.name,
            projectedCount: inWindow.length,
            maxAllowed: t.maxTouchpoints,
            windowDays: t.windowDays,
            explanation,
            overridden: overrides.has(donorId),
          });
          flaggedDonors.add(donorId);
          byThreshold.get(t.id)!.flagged.add(donorId);
          break; // one conflict per donor per threshold
        }
      }
    }
  }

  return {
    conflicts,
    totalFlaggedDonors: flaggedDonors.size,
    totalProjectedTouchpoints: totalProjected,
    byThreshold: Array.from(byThreshold.entries()).map(([id, v]) => ({
      thresholdId: id,
      thresholdName: v.name,
      flaggedCount: v.flagged.size,
    })),
  };
}

export interface PerTouchExport {
  touchId: number;
  touchName: string;
  channelLabel: string;
  campaignTypeLabel: string;
  sendDate: string;
  eligibleCount: number;
  suppressedCount: number;
  seedCount: number;
  totalRowsInExport: number;
  fileName: string;
  donorIds: string[]; // eligible (not seeds)
  seedDonorIds: string[];
}

function safeFileName(s: string): string {
  return s.replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 60);
}

export async function buildPerTouchExports(
  campaignId: number,
): Promise<PerTouchExport[]> {
  const [audience, planned, suppressions, seeds, preview, campaign] = await Promise.all([
    getCampaignAudience(campaignId),
    getCampaignTouchesForPreview(campaignId),
    getSuppressionsForCampaign(campaignId),
    getSeedGroupsForCampaign(campaignId),
    computeThresholdPreview(campaignId),
    db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)).then((r) => r[0]),
  ]);
  const thresholds = await getThresholds(campaignId);
  const overrides = await getOverrides(campaignId);
  const audienceSet = new Set(audience);

  // Determine donors to remove globally based on threshold actionMode = remove and not overridden
  const donorsRemovedByThreshold = new Set<string>();
  for (const conf of preview.conflicts) {
    const t = thresholds.find((x) => x.id === conf.thresholdId);
    if (!t) continue;
    if (t.actionMode === "remove" && !overrides.has(conf.donorId)) {
      donorsRemovedByThreshold.add(conf.donorId);
    }
  }

  const out: PerTouchExport[] = [];
  for (const p of planned) {
    // Determine suppressed set for this touch
    const suppressedSet = new Set<string>(donorsRemovedByThreshold);
    for (const s of suppressions) {
      const matches =
        s.scope === "all" ||
        (s.scope === "channel" && s.channelId === p.channelId) ||
        (s.scope === "campaign_type" && s.campaignTypeId === p.campaignTypeId) ||
        (s.scope === "touch" && s.touchId === p.id);
      if (matches) {
        for (const d of (s.donorIds as string[]) ?? []) suppressedSet.add(d);
      }
    }
    const eligible: string[] = [];
    for (const d of audienceSet) {
      if (!suppressedSet.has(d)) eligible.push(d);
    }
    const seedSet = new Set<string>();
    for (const sg of seeds) {
      const matches =
        sg.scope === "all" ||
        (sg.scope === "channel" && sg.channelId === p.channelId) ||
        (sg.scope === "touch" && sg.touchId === p.id);
      if (matches) {
        for (const d of (sg.donorIds as string[]) ?? []) seedSet.add(d);
      }
    }
    const eligibleCount = eligible.length;
    const suppressedCount = audienceSet.size - eligibleCount;
    const seedCount = seedSet.size;
    const fileName = `${safeFileName(campaign?.name ?? "campaign")}__${safeFileName(p.touchName)}__${p.sendDate}.csv`;
    out.push({
      touchId: p.id,
      touchName: p.touchName,
      channelLabel: p.channelLabel,
      campaignTypeLabel: p.campaignTypeLabel,
      sendDate: p.sendDate,
      eligibleCount,
      suppressedCount,
      seedCount,
      totalRowsInExport: eligibleCount + seedCount,
      fileName,
      donorIds: eligible,
      seedDonorIds: Array.from(seedSet),
    });
  }
  return out;
}
