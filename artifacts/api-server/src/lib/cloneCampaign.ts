/**
 * Pure planning logic for `POST /campaigns/:id/clone`.
 *
 * The route in `routes/campaigns.ts` is responsible for the I/O — loading
 * the source rows, opening a transaction, and writing the planned inserts.
 * All decisions about *what* to copy and *how dates shift* live here so they
 * can be unit-tested without a database.
 *
 * Suppression scope rules (per the campaign-cloning task plan):
 *   - Copy only suppressions whose scope is `all`, `channel`, or
 *     `campaign_type`. A `touch`-scoped suppression is tied to a single
 *     touch in the source and is intentionally NOT carried over — staff
 *     should re-curate the new cycle's per-touch exclusions.
 *   - Skip any suppression whose `donorIds` list is non-empty: those refer
 *     to specific people from the source audience, which is not copied.
 *
 * Seeds: copied verbatim, including their donor-ID lists (typically a
 * stable internal seed list). Touch-scoped seeds are dropped if their
 * source touch has no entry in the touch-id map (defensive — should not
 * normally happen since we always copy every touch).
 */

export interface CloneSourceTouch {
  id: number;
  touchName: string;
  channelId: number;
  campaignTypeId: number;
  sendDate: string; // YYYY-MM-DD
  notes: string | null;
  audienceMode: "campaign" | "custom";
}

export interface CloneSourceThreshold {
  name: string;
  maxTouchpoints: number;
  windowDays: number;
  scope: string;
  channelId: number | null;
  campaignTypeId: number | null;
  actionMode: string;
}

export interface CloneSourceSuppression {
  scope: "all" | "channel" | "campaign_type" | "touch" | string;
  channelId: number | null;
  campaignTypeId: number | null;
  touchId: number | null;
  reasonCodeId: number | null;
  reason: string | null;
  notes: string | null;
  donorIds: string[] | null;
}

export interface CloneSourceSeed {
  scope: string;
  channelId: number | null;
  touchId: number | null;
  donorIds: string[];
}

export interface CloneOptions {
  /** New intended send date for the cloned campaign (ISO YYYY-MM-DD), or null. */
  newIntendedSendDate: string | null;
  /** Source campaign's intended send date (ISO YYYY-MM-DD), or null. */
  sourceIntendedSendDate: string | null;
  /** Explicit per-touch shift in days; overrides the implicit (new - source) delta. */
  explicitShiftDays?: number;
}

export interface PlannedTouchInsert {
  sourceId: number;
  touchName: string;
  channelId: number;
  campaignTypeId: number;
  sendDate: string;
  notes: string | null;
  audienceMode: "campaign" | "custom";
}

export interface PlannedThresholdInsert {
  name: string;
  maxTouchpoints: number;
  windowDays: number;
  scope: string;
  channelId: number | null;
  campaignTypeId: number | null;
  actionMode: string;
}

export interface PlannedSuppressionInsert {
  scope: string;
  channelId: number | null;
  campaignTypeId: number | null;
  touchId: null;
  reasonCodeId: number | null;
  reason: string | null;
  notes: string | null;
  donorIds: string[];
}

export interface PlannedSeedInsert {
  scope: string;
  channelId: number | null;
  /** Caller resolves this from the touch-id map after touch inserts return ids. */
  sourceTouchId: number | null;
  donorIds: string[];
}

export interface ClonePlan {
  shiftDays: number;
  touches: PlannedTouchInsert[];
  thresholds: PlannedThresholdInsert[];
  suppressions: PlannedSuppressionInsert[];
  skippedSuppressions: number;
  seeds: PlannedSeedInsert[];
}

/** Return the day-delta to apply to every copied touch's send date. */
export function resolveShiftDays(opts: CloneOptions): number {
  if (typeof opts.explicitShiftDays === "number") return opts.explicitShiftDays;
  if (!opts.newIntendedSendDate || !opts.sourceIntendedSendDate) return 0;
  const [ny, nm, nd] = opts.newIntendedSendDate.split("-").map(Number);
  const [oy, om, od] = opts.sourceIntendedSendDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(ny, nm - 1, nd) - Date.UTC(oy, om - 1, od)) / 86400000,
  );
}

/** Apply `shiftDays` to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
export function shiftIsoDate(iso: string, shiftDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + shiftDays));
  return dt.toISOString().slice(0, 10);
}

/** Build a clone plan from the source campaign's structural rows. */
export function planClone(input: {
  touches: CloneSourceTouch[];
  thresholds: CloneSourceThreshold[];
  suppressions: CloneSourceSuppression[];
  seeds: CloneSourceSeed[];
  options: CloneOptions;
}): ClonePlan {
  const shiftDays = resolveShiftDays(input.options);

  const touches: PlannedTouchInsert[] = input.touches.map((t) => ({
    sourceId: t.id,
    touchName: t.touchName,
    channelId: t.channelId,
    campaignTypeId: t.campaignTypeId,
    sendDate: shiftIsoDate(t.sendDate, shiftDays),
    notes: t.notes,
    audienceMode: t.audienceMode,
  }));

  const thresholds: PlannedThresholdInsert[] = input.thresholds.map((th) => ({
    name: th.name,
    maxTouchpoints: th.maxTouchpoints,
    windowDays: th.windowDays,
    scope: th.scope,
    channelId: th.channelId,
    campaignTypeId: th.campaignTypeId,
    actionMode: th.actionMode,
  }));

  const suppressions: PlannedSuppressionInsert[] = [];
  let skippedSuppressions = 0;
  for (const s of input.suppressions) {
    const isCopiableScope =
      s.scope === "all" || s.scope === "channel" || s.scope === "campaign_type";
    const hasDonorIds = (s.donorIds ?? []).length > 0;
    if (!isCopiableScope || hasDonorIds) {
      skippedSuppressions++;
      continue;
    }
    suppressions.push({
      scope: s.scope,
      channelId: s.channelId,
      campaignTypeId: s.campaignTypeId,
      touchId: null,
      reasonCodeId: s.reasonCodeId,
      reason: s.reason,
      notes: s.notes,
      donorIds: [],
    });
  }

  const seeds: PlannedSeedInsert[] = input.seeds.map((sg) => ({
    scope: sg.scope,
    channelId: sg.channelId,
    sourceTouchId: sg.touchId,
    donorIds: sg.donorIds,
  }));

  return {
    shiftDays,
    touches,
    thresholds,
    suppressions,
    skippedSuppressions,
    seeds,
  };
}
