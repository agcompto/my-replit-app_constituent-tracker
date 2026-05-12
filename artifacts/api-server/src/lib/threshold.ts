import { db, touchesTable, touchpointsTable, audienceDonorsTable, touchAudienceDonorsTable, suppressionsTable, seedGroupsTable, thresholdsTable, thresholdOverridesTable, channelsTable, campaignTypesTable, campaignsTable } from "@workspace/db";
import { eq, and, ne, inArray } from "drizzle-orm";

export interface PlannedTouch {
  id: number;
  channelId: number;
  campaignTypeId: number;
  sendDate: string; // YYYY-MM-DD
  channelLabel: string;
  campaignTypeLabel: string;
  touchName: string;
  audienceMode: string;
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

// Exported for unit testing. Uses Date.UTC so DST shifts in the host TZ
// don't change the day count between two YYYY-MM-DD strings.
export function diffDays(a: string, b: string): number {
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
    audienceMode: r.audienceMode,
  }));
}

export async function getCampaignAudience(campaignId: number): Promise<string[]> {
  const rows = await db
    .select({ donorId: audienceDonorsTable.donorId })
    .from(audienceDonorsTable)
    .where(eq(audienceDonorsTable.campaignId, campaignId));
  return rows.map((r) => r.donorId);
}

export async function getTouchAudience(touchId: number): Promise<string[]> {
  const rows = await db
    .select({ donorId: touchAudienceDonorsTable.donorId })
    .from(touchAudienceDonorsTable)
    .where(eq(touchAudienceDonorsTable.touchId, touchId));
  return rows.map((r) => r.donorId);
}

/**
 * Pure resolver: given the campaign-wide audience and per-touch custom lists,
 * return the effective audience set for each planned touch. Touches with
 * audienceMode === "custom" use their own list (or empty if none uploaded yet);
 * all other touches share the campaign-wide audience.
 *
 * Extracted as a pure function so it can be unit-tested without a database.
 */
export function resolveEffectiveAudienceByTouch(
  campaignAudience: Set<string>,
  customByTouch: Map<number, Set<string>>,
  planned: PlannedTouch[],
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const p of planned) {
    if (p.audienceMode === "custom") {
      out.set(p.id, customByTouch.get(p.id) ?? new Set());
    } else {
      out.set(p.id, campaignAudience);
    }
  }
  return out;
}

/**
 * Returns a Map<touchId, Set<donorId>> giving the effective audience for each touch:
 * - touch.audienceMode === "custom" → use the touch's own list
 * - otherwise → use the campaign-wide audience
 */
export async function getEffectiveAudienceByTouch(
  campaignId: number,
  planned: PlannedTouch[],
): Promise<Map<number, Set<string>>> {
  const campaignAudience = new Set(await getCampaignAudience(campaignId));
  const customTouchIds = planned.filter((p) => p.audienceMode === "custom").map((p) => p.id);
  const customRows = customTouchIds.length
    ? await db
        .select({ touchId: touchAudienceDonorsTable.touchId, donorId: touchAudienceDonorsTable.donorId })
        .from(touchAudienceDonorsTable)
        .where(inArray(touchAudienceDonorsTable.touchId, customTouchIds))
    : [];
  const customByTouch = new Map<number, Set<string>>();
  for (const r of customRows) {
    if (!customByTouch.has(r.touchId)) customByTouch.set(r.touchId, new Set());
    customByTouch.get(r.touchId)!.add(r.donorId);
  }
  return resolveEffectiveAudienceByTouch(campaignAudience, customByTouch, planned);
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

export interface ThresholdRule {
  id: number;
  name: string;
  scope: "all" | "channel" | "campaign_type" | "channel_and_type";
  channelId: number | null;
  campaignTypeId: number | null;
  windowDays: number;
  maxTouchpoints: number;
}

/**
 * Pure threshold-conflict computation. Extracted from `computeThresholdPreview`
 * so it can be unit-tested with hand-crafted inputs (notably for DST/timezone
 * edge cases at the rolling-window boundary).
 */
export function computeThresholdConflicts(input: {
  planned: PlannedTouch[];
  history: HistoryRow[];
  thresholds: ThresholdRule[];
  overrides: Set<string>;
  audienceByTouch: Map<number, Set<string>>;
}): PreviewOutput {
  const { planned, history, thresholds, overrides, audienceByTouch } = input;

  const allDonors = new Set<string>();
  for (const set of audienceByTouch.values()) {
    for (const d of set) allDonors.add(d);
  }

  const conflicts: Array<ConflictAccum & { overridden: boolean }> = [];
  const byThreshold = new Map<number, { name: string; flagged: Set<string> }>();
  const flaggedDonors = new Set<string>();
  let totalProjected = 0;

  for (const t of thresholds) {
    byThreshold.set(t.id, { name: t.name, flagged: new Set() });
  }

  const perDonorEvents = new Map<string, Array<{ sendDate: string; channelId: number; campaignTypeId: number; isPlanned: boolean }>>();
  for (const h of history) {
    if (!allDonors.has(h.donorId)) continue;
    const arr = perDonorEvents.get(h.donorId) ?? [];
    arr.push({ sendDate: h.sendDate, channelId: h.channelId, campaignTypeId: h.campaignTypeId, isPlanned: false });
    perDonorEvents.set(h.donorId, arr);
  }
  for (const donorId of allDonors) {
    const arr = perDonorEvents.get(donorId) ?? [];
    for (const p of planned) {
      if (!audienceByTouch.get(p.id)?.has(donorId)) continue;
      arr.push({ sendDate: p.sendDate, channelId: p.channelId, campaignTypeId: p.campaignTypeId, isPlanned: true });
      totalProjected += 1;
    }
    perDonorEvents.set(donorId, arr);
  }

  for (const [donorId, events] of perDonorEvents) {
    for (const t of thresholds) {
      const filtered = events.filter((e) => {
        if (t.scope === "channel") return e.channelId === t.channelId;
        if (t.scope === "campaign_type") return e.campaignTypeId === t.campaignTypeId;
        if (t.scope === "channel_and_type")
          return e.channelId === t.channelId && e.campaignTypeId === t.campaignTypeId;
        return true;
      });
      if (filtered.length === 0) continue;
      for (const plannedEvt of filtered.filter((e) => e.isPlanned)) {
        const inWindow = filtered.filter((e) => diffDays(e.sendDate, plannedEvt.sendDate) < t.windowDays);
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
          break;
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

/**
 * Count distinct donors that would be excluded (removed) from exports because
 * of "remove"-action threshold rules, ignoring per-donor overrides. This is
 * the metric the AI date-shift suggester optimizes: a candidate proposal is
 * only kept if it strictly reduces this count.
 */
export function countExcludedByRemoveThresholds(
  conflicts: PreviewOutput["conflicts"],
  thresholds: Array<{ id: number; actionMode: string }>,
): number {
  const removeIds = new Set(
    thresholds.filter((t) => t.actionMode === "remove").map((t) => t.id),
  );
  const excluded = new Set<string>();
  for (const c of conflicts) {
    if (c.overridden) continue;
    if (removeIds.has(c.thresholdId)) excluded.add(c.donorId);
  }
  return excluded.size;
}

export async function computeThresholdPreview(campaignId: number): Promise<PreviewOutput> {
  const [planned, history, thresholds, overrides] = await Promise.all([
    getCampaignTouchesForPreview(campaignId),
    getHistoricalTouchpoints(campaignId),
    getThresholds(campaignId),
    getOverrides(campaignId),
  ]);
  const audienceByTouch = await getEffectiveAudienceByTouch(campaignId, planned);
  return computeThresholdConflicts({
    planned,
    history,
    thresholds: thresholds as unknown as ThresholdRule[],
    overrides,
    audienceByTouch,
  });
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
  const [planned, suppressions, seeds, preview, campaign] = await Promise.all([
    getCampaignTouchesForPreview(campaignId),
    getSuppressionsForCampaign(campaignId),
    getSeedGroupsForCampaign(campaignId),
    computeThresholdPreview(campaignId),
    db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId)).then((r) => r[0]),
  ]);
  const audienceByTouch = await getEffectiveAudienceByTouch(campaignId, planned);
  const thresholds = await getThresholds(campaignId);
  const overrides = await getOverrides(campaignId);

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
    const touchAudience = audienceByTouch.get(p.id) ?? new Set<string>();
    const suppressedSet = new Set<string>();
    for (const d of donorsRemovedByThreshold) {
      if (touchAudience.has(d)) suppressedSet.add(d);
    }
    for (const s of suppressions) {
      const matches =
        s.scope === "all" ||
        (s.scope === "channel" && s.channelId === p.channelId) ||
        (s.scope === "campaign_type" && s.campaignTypeId === p.campaignTypeId) ||
        (s.scope === "touch" && s.touchId === p.id);
      if (matches) {
        for (const d of (s.donorIds as string[]) ?? []) {
          if (touchAudience.has(d)) suppressedSet.add(d);
        }
      }
    }
    const eligible: string[] = [];
    for (const d of touchAudience) {
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
    const suppressedCount = touchAudience.size - eligibleCount;
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
