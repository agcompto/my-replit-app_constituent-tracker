import { and, desc, eq } from "drizzle-orm";
import {
  db,
  campaignsTable,
  touchesTable,
  thresholdsTable,
  thresholdOverridesTable,
  suppressionsTable,
  seedGroupsTable,
  campaignHealthChecksTable,
} from "@workspace/db";
import {
  computeThresholdPreview,
  getCampaignTouchesForPreview,
  getEffectiveAudienceByTouch,
} from "./threshold";

export type HealthSeverity = "info" | "warning" | "error";
export type HealthStatus = "pass" | "warning" | "error";

export interface HealthFinding {
  code: string;
  severity: HealthSeverity;
  message: string;
  recommendation?: string | null;
  count?: number | null;
}

export interface HealthCheckResult {
  campaignId: number;
  status: HealthStatus;
  findings: HealthFinding[];
  generatedAt: string;
  snapshotId?: number | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pure-ish rule engine. Rolls up per-rule findings into an overall status.
 * Any error → error. Otherwise any warning → warning. Otherwise pass.
 */
export async function computeHealthCheck(campaignId: number): Promise<HealthCheckResult> {
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  const findings: HealthFinding[] = [];

  if (!campaign) {
    return {
      campaignId,
      status: "error",
      findings: [
        { code: "E_NOT_FOUND", severity: "error", message: "Campaign not found." },
      ],
      generatedAt: new Date().toISOString(),
    };
  }

  if (campaign.status === "voided") {
    findings.push({
      code: "E_VOIDED",
      severity: "error",
      message: "This campaign has been voided and cannot be exported.",
    });
  }

  const planned = await getCampaignTouchesForPreview(campaignId);
  if (planned.length === 0) {
    findings.push({
      code: "E_NO_TOUCHES",
      severity: "error",
      message: "No touches have been added to this campaign.",
      recommendation: "Add at least one touch on the Touches step before exporting.",
    });
  }

  const audienceByTouch = planned.length
    ? await getEffectiveAudienceByTouch(campaignId, planned)
    : new Map<number, Set<string>>();

  let totalEligible = 0;
  const emptyCustomTouches: string[] = [];
  for (const p of planned) {
    const set = audienceByTouch.get(p.id) ?? new Set<string>();
    totalEligible += set.size;
    if (p.audienceMode === "custom" && set.size === 0) {
      emptyCustomTouches.push(p.touchName);
    }
  }
  if (planned.length > 0 && totalEligible === 0) {
    findings.push({
      code: "E_NO_AUDIENCE",
      severity: "error",
      message: "No constituents will receive any touch in this campaign.",
      recommendation: "Upload an audience on the Audience step or attach per-touch lists.",
    });
  }
  if (emptyCustomTouches.length > 0) {
    findings.push({
      code: "E_EMPTY_CUSTOM_TOUCH",
      severity: "error",
      message: `${emptyCustomTouches.length} custom-audience touch(es) have no constituents uploaded: ${emptyCustomTouches.slice(0, 3).join(", ")}${emptyCustomTouches.length > 3 ? "…" : ""}.`,
      count: emptyCustomTouches.length,
      recommendation: "Upload a list for each custom-audience touch or switch them back to use the campaign-wide audience.",
    });
  }

  // Past-dated touches → warning (allow back-dated retroactive exports)
  const today = todayISO();
  const pastTouches = planned.filter((p) => p.sendDate < today);
  if (pastTouches.length > 0) {
    findings.push({
      code: "W_PAST_TOUCHES",
      severity: "warning",
      message: `${pastTouches.length} touch(es) have a send date in the past.`,
      count: pastTouches.length,
      recommendation: "Confirm these are intentional back-dated entries before exporting.",
    });
  }

  // Same channel/day collisions (likely a mistake)
  const seenSlots = new Map<string, number>();
  for (const p of planned) {
    const key = `${p.channelId}:${p.sendDate}`;
    seenSlots.set(key, (seenSlots.get(key) ?? 0) + 1);
  }
  const collisionCount = Array.from(seenSlots.values()).filter((n) => n > 1).length;
  if (collisionCount > 0) {
    findings.push({
      code: "W_DUPLICATE_SLOT",
      severity: "warning",
      message: `${collisionCount} channel/date slot(s) contain more than one touch.`,
      count: collisionCount,
      recommendation: "Confirm constituents are not being contacted twice on the same day in the same channel.",
    });
  }

  // Threshold reviews
  const thresholds = await db
    .select()
    .from(thresholdsTable)
    .where(eq(thresholdsTable.campaignId, campaignId));
  if (planned.length > 0 && thresholds.length === 0) {
    findings.push({
      code: "W_NO_THRESHOLDS",
      severity: "warning",
      message: "No volume thresholds are defined for this campaign.",
      recommendation: "Add at least one threshold on the Thresholds step to check rolling volume.",
    });
  } else if (planned.length > 0) {
    const preview = await computeThresholdPreview(campaignId);
    const overrides = await db
      .select({ donorId: thresholdOverridesTable.donorId })
      .from(thresholdOverridesTable)
      .where(eq(thresholdOverridesTable.campaignId, campaignId));
    const overrideSet = new Set(overrides.map((o) => o.donorId));
    const flagThresholdIds = new Set(
      thresholds.filter((t) => t.actionMode === "flag" || t.actionMode === "manual").map((t) => t.id),
    );
    const manualThresholdIds = new Set(
      thresholds.filter((t) => t.actionMode === "manual").map((t) => t.id),
    );
    const unresolvedManual = preview.conflicts.filter(
      (c) => manualThresholdIds.has(c.thresholdId) && !overrideSet.has(c.donorId),
    );
    if (unresolvedManual.length > 0) {
      const distinct = new Set(unresolvedManual.map((c) => c.donorId)).size;
      findings.push({
        code: "E_UNRESOLVED_MANUAL",
        severity: "error",
        message: `${distinct} constituent(s) hit a manual-action threshold and have not been individually overridden.`,
        count: distinct,
        recommendation: "Review each flagged constituent on the Thresholds step and explicitly include or exclude them.",
      });
    }
    const flaggedNoOverride = preview.conflicts.filter(
      (c) => flagThresholdIds.has(c.thresholdId) && !overrideSet.has(c.donorId) && !manualThresholdIds.has(c.thresholdId),
    );
    if (flaggedNoOverride.length > 0) {
      const distinct = new Set(flaggedNoOverride.map((c) => c.donorId)).size;
      findings.push({
        code: "W_FLAGGED_NOT_OVERRIDDEN",
        severity: "warning",
        message: `${distinct} flagged constituent(s) have not been reviewed.`,
        count: distinct,
        recommendation: "Open the Thresholds step to confirm the flagged constituents should still receive the planned touches.",
      });
    }
  }

  // Upload quality warnings (only if anything was uploaded)
  if (campaign.originalRowCount > 0) {
    const rejectRatio = campaign.rejectedIdCount / campaign.originalRowCount;
    if (rejectRatio >= 0.05) {
      findings.push({
        code: "W_HIGH_REJECT_RATE",
        severity: "warning",
        message: `${(rejectRatio * 100).toFixed(1)}% of uploaded rows were rejected (${campaign.rejectedIdCount} of ${campaign.originalRowCount}).`,
        count: campaign.rejectedIdCount,
        recommendation: "Re-check the source list for stray text, headers, or wrong column.",
      });
    }
    const dupRatio = campaign.duplicateIdCount / campaign.originalRowCount;
    if (dupRatio >= 0.1) {
      findings.push({
        code: "W_HIGH_DUP_RATE",
        severity: "warning",
        message: `${(dupRatio * 100).toFixed(1)}% of uploaded rows were duplicates (${campaign.duplicateIdCount} of ${campaign.originalRowCount}).`,
        count: campaign.duplicateIdCount,
      });
    }
    if (campaign.extraColumnsIgnored) {
      findings.push({
        code: "I_EXTRA_COLUMNS",
        severity: "info",
        message: "Extra columns were detected in the uploaded list and were ignored.",
      });
    }
  }

  // Suppressions without a reason code
  const suppressions = await db
    .select({ reasonCodeId: suppressionsTable.reasonCodeId, reason: suppressionsTable.reason })
    .from(suppressionsTable)
    .where(eq(suppressionsTable.campaignId, campaignId));
  const uncategorized = suppressions.filter(
    (s) => s.reasonCodeId == null && (!s.reason || s.reason.trim() === ""),
  );
  if (uncategorized.length > 0) {
    findings.push({
      code: "W_UNCATEGORIZED_SUPPRESSIONS",
      severity: "warning",
      message: `${uncategorized.length} suppression list(s) have no reason code or text reason recorded.`,
      count: uncategorized.length,
      recommendation: "Pick a reason code on each suppression so the audit trail stays complete.",
    });
  }

  // Informational badges (always added so the panel never feels empty on a clean campaign)
  if (planned.length > 0) {
    findings.push({
      code: "I_TOUCH_COUNT",
      severity: "info",
      message: `${planned.length} touch(es) planned across ${new Set(planned.map((p) => p.channelLabel)).size} channel(s).`,
    });
  }
  const seedCount = await db
    .select({ id: seedGroupsTable.id })
    .from(seedGroupsTable)
    .where(eq(seedGroupsTable.campaignId, campaignId));
  if (seedCount.length > 0) {
    findings.push({
      code: "I_SEEDS",
      severity: "info",
      message: `${seedCount.length} seed group(s) attached.`,
    });
  }

  let status: HealthStatus = "pass";
  if (findings.some((f) => f.severity === "error")) status = "error";
  else if (findings.some((f) => f.severity === "warning")) status = "warning";

  return {
    campaignId,
    status,
    findings,
    generatedAt: new Date().toISOString(),
  };
}

export async function snapshotHealthCheck(
  campaignId: number,
  result: HealthCheckResult,
  userId: number | null,
): Promise<number> {
  const [row] = await db
    .insert(campaignHealthChecksTable)
    .values({
      campaignId,
      status: result.status,
      findings: result.findings.map((f) => ({
        code: f.code,
        severity: f.severity,
        message: f.message,
        recommendation: f.recommendation ?? null,
        count: f.count ?? null,
      })),
      createdByUserId: userId,
    })
    .returning({ id: campaignHealthChecksTable.id });
  return row.id;
}

export async function loadLatestHealthCheckStatus(
  campaignId: number,
): Promise<HealthStatus | null> {
  const [row] = await db
    .select({ status: campaignHealthChecksTable.status })
    .from(campaignHealthChecksTable)
    .where(eq(campaignHealthChecksTable.campaignId, campaignId))
    .orderBy(desc(campaignHealthChecksTable.createdAt))
    .limit(1);
  if (!row) return null;
  return row.status as HealthStatus;
}

void and;
