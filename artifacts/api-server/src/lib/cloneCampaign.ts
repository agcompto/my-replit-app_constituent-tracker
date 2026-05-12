import { eq } from "drizzle-orm";
import {
  db,
  campaignsTable,
  campaignTypeLinksTable,
  touchesTable,
  thresholdsTable,
  suppressionsTable,
  seedGroupsTable,
  auditLogTable,
} from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export interface ExecuteCloneResult {
  newCampaignId: number;
  copiedTouches: number;
  copiedThresholds: number;
  copiedSuppressions: number;
  skippedSuppressions: number;
  copiedSeeds: number;
  shiftDays: number;
}

/**
 * Transactional clone: load the source's structural rows, plan the clone,
 * and write the new campaign + its children + a `campaign_cloned` audit row
 * inside the supplied Drizzle transaction. Pulled out of the route so it can
 * be exercised by integration tests without spinning up an HTTP server.
 *
 * The audience (`audience_donors`), per-touch overrides, upload jobs, export
 * jobs, recorded touchpoints, and the source's audit history are all
 * intentionally NOT copied — only structural setup transfers to the new
 * draft.
 */
export async function executeClone(
  tx: Tx,
  args: {
    sourceCampaignId: number;
    actingUserId: number;
    actingUserName: string;
    actingUserRole: string;
    newName: string;
    newIntendedSendDate: string | null;
    explicitShiftDays?: number;
  },
): Promise<ExecuteCloneResult> {
  const [source] = await tx
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, args.sourceCampaignId));
  if (!source) {
    throw new Error(`Source campaign ${args.sourceCampaignId} not found`);
  }

  const sourceTouches = await tx
    .select()
    .from(touchesTable)
    .where(eq(touchesTable.campaignId, source.id))
    .orderBy(touchesTable.sendDate);
  const sourceThresholds = await tx
    .select()
    .from(thresholdsTable)
    .where(eq(thresholdsTable.campaignId, source.id));
  const sourceSuppressions = await tx
    .select()
    .from(suppressionsTable)
    .where(eq(suppressionsTable.campaignId, source.id));
  const sourceSeeds = await tx
    .select()
    .from(seedGroupsTable)
    .where(eq(seedGroupsTable.campaignId, source.id));
  const sourceCampaignTypeLinks = await tx
    .select()
    .from(campaignTypeLinksTable)
    .where(eq(campaignTypeLinksTable.campaignId, source.id));

  const sourceIntended =
    typeof source.intendedSendStartDate === "string"
      ? source.intendedSendStartDate
      : source.intendedSendStartDate
        ? (source.intendedSendStartDate as Date).toISOString().slice(0, 10)
        : null;

  const plan = planClone({
    touches: sourceTouches.map((t) => ({
      id: t.id,
      touchName: t.touchName,
      channelId: t.channelId,
      campaignTypeId: t.campaignTypeId,
      sendDate:
        typeof t.sendDate === "string"
          ? t.sendDate
          : (t.sendDate as Date).toISOString().slice(0, 10),
      notes: t.notes,
      audienceMode: t.audienceMode as "campaign" | "custom",
    })),
    thresholds: sourceThresholds.map((th) => ({
      name: th.name,
      maxTouchpoints: th.maxTouchpoints,
      windowDays: th.windowDays,
      scope: th.scope,
      channelId: th.channelId,
      campaignTypeId: th.campaignTypeId,
      actionMode: th.actionMode,
    })),
    suppressions: sourceSuppressions.map((s) => ({
      scope: s.scope,
      channelId: s.channelId,
      campaignTypeId: s.campaignTypeId,
      touchId: s.touchId,
      reasonCodeId: s.reasonCodeId,
      reason: s.reason,
      notes: s.notes,
      donorIds: (s.donorIds ?? []) as string[],
    })),
    seeds: sourceSeeds.map((sg) => ({
      scope: sg.scope,
      channelId: sg.channelId,
      touchId: sg.touchId,
      donorIds: (sg.donorIds ?? []) as string[],
    })),
    options: {
      newIntendedSendDate: args.newIntendedSendDate,
      sourceIntendedSendDate: sourceIntended,
      explicitShiftDays: args.explicitShiftDays,
    },
  });

  const [newCampaign] = await tx
    .insert(campaignsTable)
    .values({
      name: args.newName,
      owningUnit: source.owningUnit,
      submittedByUserId: args.actingUserId,
      intendedSendStartDate: args.newIntendedSendDate,
      audienceDescription: source.audienceDescription,
      salesforceCampaignId: null,
      internalNotes: source.internalNotes,
      status: "draft",
    })
    .returning();

  if (sourceCampaignTypeLinks.length > 0) {
    await tx.insert(campaignTypeLinksTable).values(
      sourceCampaignTypeLinks.map((l) => ({
        campaignId: newCampaign.id,
        campaignTypeId: l.campaignTypeId,
      })),
    );
  }

  const touchIdMap = new Map<number, number>();
  for (const pt of plan.touches) {
    const [nt] = await tx
      .insert(touchesTable)
      .values({
        campaignId: newCampaign.id,
        touchName: pt.touchName,
        channelId: pt.channelId,
        campaignTypeId: pt.campaignTypeId,
        sendDate: pt.sendDate,
        notes: pt.notes,
        audienceMode: pt.audienceMode,
        createdBySource: "manual",
      })
      .returning();
    touchIdMap.set(pt.sourceId, nt.id);
  }

  if (plan.thresholds.length > 0) {
    await tx.insert(thresholdsTable).values(
      plan.thresholds.map((th) => ({
        campaignId: newCampaign.id,
        name: th.name,
        maxTouchpoints: th.maxTouchpoints,
        windowDays: th.windowDays,
        scope: th.scope,
        channelId: th.channelId,
        campaignTypeId: th.campaignTypeId,
        actionMode: th.actionMode,
      })),
    );
  }

  if (plan.suppressions.length > 0) {
    await tx.insert(suppressionsTable).values(
      plan.suppressions.map((s) => ({
        campaignId: newCampaign.id,
        scope: s.scope,
        channelId: s.channelId,
        campaignTypeId: s.campaignTypeId,
        touchId: null,
        reasonCodeId: s.reasonCodeId,
        reason: s.reason,
        notes: s.notes,
        donorIds: [],
        createdByUserId: args.actingUserId,
      })),
    );
  }

  let copiedSeeds = 0;
  const seedInserts: Array<typeof seedGroupsTable.$inferInsert> = [];
  for (const ps of plan.seeds) {
    const remappedTouchId =
      ps.sourceTouchId != null ? (touchIdMap.get(ps.sourceTouchId) ?? null) : null;
    if (ps.sourceTouchId != null && remappedTouchId == null) continue;
    seedInserts.push({
      campaignId: newCampaign.id,
      scope: ps.scope,
      channelId: ps.channelId,
      touchId: remappedTouchId,
      donorIds: ps.donorIds,
      createdByUserId: args.actingUserId,
    });
    copiedSeeds++;
  }
  if (seedInserts.length > 0) {
    await tx.insert(seedGroupsTable).values(seedInserts);
  }

  await tx.insert(auditLogTable).values({
    actorUserId: args.actingUserId,
    actorName: args.actingUserName,
    actorRole: args.actingUserRole,
    action: "campaign_cloned",
    entityType: "campaign",
    entityId: newCampaign.id,
    details: `Cloned from campaign ${source.id} ("${source.name}") shiftDays=${plan.shiftDays} touches=${plan.touches.length} thresholds=${plan.thresholds.length} suppressions=${plan.suppressions.length}/${plan.suppressions.length + plan.skippedSuppressions} seeds=${copiedSeeds}`,
  });

  return {
    newCampaignId: newCampaign.id,
    copiedTouches: plan.touches.length,
    copiedThresholds: plan.thresholds.length,
    copiedSuppressions: plan.suppressions.length,
    skippedSuppressions: plan.skippedSuppressions,
    copiedSeeds,
    shiftDays: plan.shiftDays,
  };
}
