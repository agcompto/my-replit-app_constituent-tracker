import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  campaignsTable,
  audienceDonorsTable,
  touchesTable,
  channelsTable,
  campaignTypesTable,
  campaignTypeLinksTable,
  suppressionReasonCodesTable,
  thresholdsTable,
  owningUnitsTable,
} from "@workspace/db";
import {
  computeThresholdConflicts,
  countExcludedByRemoveThresholds,
  getCampaignTouchesForPreview,
  getEffectiveAudienceByTouch,
  getHistoricalTouchpoints,
  getOverrides,
  getThresholds,
  type PlannedTouch,
  type ThresholdRule,
} from "../lib/threshold";
import {
  AiClassifySuppressionReasonBody,
  AiSuggestOverrideReasonBody,
  AiCampaignBriefBody,
} from "@workspace/api-zod";
import { requireAuth, audit } from "../lib/auth";
import { checkAiPerMinute } from "../lib/rateLimit";
import {
  complete,
  completeJson,
  ensureAiEnabled,
  ensureUnderDailyBudget,
  recordAiUsage,
  AiDisabledError,
  AiPiiBlockedError,
  AiBudgetExceededError,
  assertNoPii,
  MODEL,
  AI_DAILY_TOKEN_BUDGET,
} from "../lib/ai";

const router: IRouter = Router();

function handleAiError(err: unknown, res: import("express").Response, log: { error: (obj: unknown, msg?: string) => void }): void {
  if (err instanceof AiDisabledError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (err instanceof AiPiiBlockedError) {
    res.status(422).json({ error: err.message });
    return;
  }
  if (err instanceof AiBudgetExceededError) {
    res.status(429).json({ error: err.message });
    return;
  }
  log.error({ err }, "AI request failed");
  res.status(502).json({ error: "AI request failed" });
}

/**
 * Run common AI gating: settings flag, per-user-per-minute throttle, and
 * daily token budget. Returns true if the request should proceed; otherwise
 * writes the response and returns false.
 */
async function gateAiRequest(
  req: import("express").Request,
  res: import("express").Response,
): Promise<boolean> {
  await ensureAiEnabled();
  const userId = req.currentUser!.id;
  const rate = checkAiPerMinute(userId);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSec));
    res.status(429).json({
      error: `AI rate limit exceeded. Try again in ${rate.retryAfterSec}s.`,
    });
    return false;
  }
  await ensureUnderDailyBudget(userId);
  return true;
}

router.post("/campaigns/:id/ai/audience-summary", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceDonorsTable)
      .where(eq(audienceDonorsTable.campaignId, id));

    const types = await db
      .select({ name: campaignTypesTable.name })
      .from(campaignTypeLinksTable)
      .innerJoin(campaignTypesTable, eq(campaignTypeLinksTable.campaignTypeId, campaignTypesTable.id))
      .where(eq(campaignTypeLinksTable.campaignId, id));

    const touches = await db
      .select({
        name: touchesTable.touchName,
        channel: channelsTable.name,
        type: campaignTypesTable.name,
        sendDate: touchesTable.sendDate,
      })
      .from(touchesTable)
      .innerJoin(channelsTable, eq(touchesTable.channelId, channelsTable.id))
      .innerJoin(campaignTypesTable, eq(touchesTable.campaignTypeId, campaignTypesTable.id))
      .where(eq(touchesTable.campaignId, id))
      .orderBy(touchesTable.sendDate);

    // Send only structured, non-free-text metadata to the model. We deliberately
    // drop campaign name, audienceDescription, and touch names — those are
    // free-text fields where staff could (despite the no-PII policy) have typed
    // names, addresses, etc. assertNoPii() is a defense-in-depth net.
    const facts = {
      status: campaign.status,
      owningUnit: campaign.owningUnit,
      intendedSendStartDate: campaign.intendedSendStartDate,
      campaignTypes: types.map((t) => t.name),
      audienceUniqueCount: count,
      touchCount: touches.length,
      touches: touches.slice(0, 12).map((t) => ({
        channel: t.channel,
        type: t.type,
        sendDate: typeof t.sendDate === "string" ? t.sendDate : (t.sendDate as Date).toISOString().slice(0, 10),
      })),
    };
    assertNoPii(facts, "campaign");

    const result = await complete({
      system:
        "You are a concise advancement-operations assistant for NC State University. " +
        "Summarize a constituent communication campaign for an internal staff audience. " +
        "Never reveal personally identifying information; the data you receive contains no donor PII. " +
        "Keep summaries to 3-5 sentences with plain professional language.",
      user:
        "Summarize this campaign in 3-5 sentences for an advancement officer scanning a dashboard. " +
        "Focus on audience size, planned cadence, and notable risks (e.g. tight intervals, mixed channels). " +
        "Do not invent facts that aren't in the JSON.\n\n" +
        JSON.stringify(facts, null, 2),
      maxTokens: 1024,
    });
    usage = { input: result.inputTokens, output: result.outputTokens, ok: true };

    res.json({ summary: result.text, generatedAt: new Date().toISOString() });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "audience-summary",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_audience_summary",
        entityType: "campaign",
        entityId: id,
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

router.post("/campaigns/:id/ai/suggest-cadence", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }

    const [{ count: audienceCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audienceDonorsTable)
      .where(eq(audienceDonorsTable.campaignId, id));

    const types = await db
      .select({ name: campaignTypesTable.name })
      .from(campaignTypeLinksTable)
      .innerJoin(campaignTypesTable, eq(campaignTypeLinksTable.campaignTypeId, campaignTypesTable.id))
      .where(eq(campaignTypeLinksTable.campaignId, id));

    const channels = await db
      .select({ name: channelsTable.name })
      .from(channelsTable)
      .where(eq(channelsTable.active, true));

    // Free-text fields (campaign.name, audienceDescription) are intentionally
    // omitted; only structured metadata is sent to the model.
    const facts = {
      audienceUniqueCount: audienceCount,
      campaignTypes: types.map((t) => t.name),
      intendedSendStartDate: campaign.intendedSendStartDate,
      availableChannels: channels.map((c) => c.name),
    };
    assertNoPii(facts, "campaign");

    const data = await completeJson<{
      rationale: string;
      touches: { order: number; channelLabel: string; dayOffset: number; purpose: string }[];
    }>({
      system:
        "You are an advancement-operations assistant suggesting communication cadences for NC State University. " +
        "Output STRICT JSON only — no prose, no Markdown, no backticks. " +
        "The JSON must match the schema in the user message exactly. " +
        "Suggest 2-4 touches that respect typical donor-fatigue limits (max 3 touches in any 14-day window).",
      user:
        "Recommend a cadence of 2-4 touches for the campaign described below. " +
        "Each touch must use a channel from availableChannels (use the EXACT label) and a non-negative dayOffset measured in days from the intended start date (offset 0 = start date). " +
        "Ensure no two touches share the same dayOffset within 3 days on the same channel. " +
        "Return JSON of the form: " +
        '{"rationale": "...", "touches": [{"order": 1, "channelLabel": "Email", "dayOffset": 0, "purpose": "..."}]}\n\n' +
        JSON.stringify(facts, null, 2),
      maxTokens: 1500,
    });
    usage = { input: data.inputTokens, output: data.outputTokens, ok: true };

    if (!Array.isArray(data.value.touches)) {
      res.status(502).json({ error: "AI returned malformed cadence" });
      return;
    }
    const channelLabels = new Set(channels.map((c) => c.name));
    const touches = data.value.touches
      .filter((t) => t && typeof t.channelLabel === "string" && channelLabels.has(t.channelLabel))
      .slice(0, 6)
      .map((t, i) => ({
        order: Number(t.order) || i + 1,
        channelLabel: t.channelLabel,
        dayOffset: Math.max(0, Math.floor(Number(t.dayOffset) || 0)),
        purpose: String(t.purpose ?? ""),
      }));

    res.json({
      generatedAt: new Date().toISOString(),
      rationale: String(data.value.rationale ?? ""),
      touches,
    });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "suggest-cadence",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_suggest_cadence",
        entityType: "campaign",
        entityId: id,
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

interface DateShiftCandidate {
  touchId: number;
  proposedSendDate: string;
  rationale: string;
}

/**
 * Pure helper: given the planned touches, the per-touch effective audience,
 * threshold rules, history, overrides, and a list of model-proposed
 * candidates, recompute excluded-donor counts under the user's rules with
 * each candidate's date substituted, drop any candidate that does not
 * strictly improve on the current count, and cap the result at 3.
 *
 * Exported for unit testing.
 */
export function filterDateShiftCandidates(input: {
  planned: PlannedTouch[];
  audienceByTouch: Map<number, Set<string>>;
  thresholds: ThresholdRule[];
  thresholdsWithAction: Array<{ id: number; actionMode: string }>;
  history: Parameters<typeof computeThresholdConflicts>[0]["history"];
  overrides: Set<string>;
  currentExcluded: number;
  candidates: DateShiftCandidate[];
}): Array<{
  touchId: number;
  touchName: string;
  currentSendDate: string;
  proposedSendDate: string;
  projectedExcludedDelta: number;
  projectedExcludedAfter: number;
  rationale: string;
}> {
  const { planned, audienceByTouch, thresholds, thresholdsWithAction, history, overrides, currentExcluded, candidates } = input;
  const byId = new Map(planned.map((p) => [p.id, p]));
  const out: ReturnType<typeof filterDateShiftCandidates> = [];
  // Dedupe by touchId — only keep the first candidate per touch.
  const seenTouches = new Set<number>();
  for (const cand of candidates) {
    const original = byId.get(cand.touchId);
    if (!original) continue;
    if (seenTouches.has(cand.touchId)) continue;
    const proposedPlanned = planned.map((p) =>
      p.id === cand.touchId ? { ...p, sendDate: cand.proposedSendDate } : p,
    );
    const result = computeThresholdConflicts({
      planned: proposedPlanned,
      history,
      thresholds,
      overrides,
      audienceByTouch,
    });
    const after = countExcludedByRemoveThresholds(result.conflicts, thresholdsWithAction);
    if (after >= currentExcluded) continue;
    seenTouches.add(cand.touchId);
    out.push({
      touchId: cand.touchId,
      touchName: original.touchName,
      currentSendDate: original.sendDate,
      proposedSendDate: cand.proposedSendDate,
      projectedExcludedDelta: currentExcluded - after,
      projectedExcludedAfter: after,
      rationale: cand.rationale,
    });
    if (out.length >= 3) break;
  }
  return out;
}

function isWithinShiftWindow(currentISO: string, proposedISO: string): boolean {
  const [cy, cm, cd] = currentISO.split("-").map(Number);
  const [py, pm, pd] = proposedISO.split("-").map(Number);
  const cur = Date.UTC(cy, cm - 1, cd);
  const pro = Date.UTC(py, pm - 1, pd);
  const diff = Math.round((pro - cur) / 86400000);
  return Math.abs(diff) <= 7;
}

function todayISOUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

router.post("/campaigns/:id/ai/suggest-date-shifts", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id));
    if (!campaign) { res.status(404).json({ error: "Not found" }); return; }
    if (campaign.status === "finalized" || campaign.status === "exported" || campaign.status === "archived" || campaign.status === "voided") {
      res.json({ generatedAt: new Date().toISOString(), currentExcludedCount: 0, suggestions: [] });
      return;
    }

    const [planned, history, thresholdRows, overrides] = await Promise.all([
      getCampaignTouchesForPreview(id),
      getHistoricalTouchpoints(id),
      getThresholds(id),
      getOverrides(id),
    ]);
    const audienceByTouch = await getEffectiveAudienceByTouch(id, planned);
    const thresholds = thresholdRows as unknown as ThresholdRule[];
    const thresholdsWithAction = (thresholdRows as Array<{ id: number; actionMode: string }>).map((t) => ({
      id: t.id, actionMode: t.actionMode,
    }));

    const baseline = computeThresholdConflicts({ planned, history, thresholds, overrides, audienceByTouch });
    const currentExcluded = countExcludedByRemoveThresholds(baseline.conflicts, thresholdsWithAction);

    // Short-circuit: nothing to optimize.
    if (currentExcluded === 0 || planned.length === 0) {
      res.json({ generatedAt: new Date().toISOString(), currentExcludedCount: currentExcluded, suggestions: [] });
      return;
    }

    // Per-touch audience size (how many donors a touch reaches under current
    // audience config). No donor IDs are sent.
    const facts = {
      campaignTypes: (await db
        .select({ name: campaignTypesTable.name })
        .from(campaignTypeLinksTable)
        .innerJoin(campaignTypesTable, eq(campaignTypeLinksTable.campaignTypeId, campaignTypesTable.id))
        .where(eq(campaignTypeLinksTable.campaignId, id))).map((t) => t.name),
      currentExcludedCount: currentExcluded,
      thresholdRules: thresholds.map((t) => ({
        id: t.id,
        windowDays: t.windowDays,
        maxTouchpoints: t.maxTouchpoints,
        scope: t.scope,
      })),
      touches: planned.map((p) => ({
        touchId: p.id,
        order: planned.indexOf(p) + 1,
        channelLabel: p.channelLabel,
        campaignTypeLabel: p.campaignTypeLabel,
        currentSendDate: p.sendDate,
        audienceSize: audienceByTouch.get(p.id)?.size ?? 0,
        flaggedDonorsAtThisTouch: baseline.conflicts.filter((c) => {
          // approximate: touches with this date are likely to be the offending one
          return audienceByTouch.get(p.id)?.has(c.donorId) ?? false;
        }).length,
      })),
    };
    assertNoPii(facts, "campaign");

    const todayISO = todayISOUtc();
    const data = await completeJson<{
      suggestions: { touchId: number; proposedSendDate: string; rationale: string }[];
    }>({
      system:
        "You are an advancement-operations assistant proposing small calendar shifts to reduce communication-volume conflicts. " +
        "Output STRICT JSON only — no prose, no Markdown, no backticks. " +
        "Propose AT MOST 3 candidate single-touch date shifts. Each proposed date MUST be within ±7 days of the touch's current send date and MUST NOT be in the past. " +
        "You MAY only shift dates — never change channel, audience, or rules.",
      user:
        "Suggest up to 3 small date shifts that would smooth a communication-volume spike under the listed threshold rules. " +
        "Today is " + todayISO + ". Each proposedSendDate must be a YYYY-MM-DD string, on or after today, and within ±7 days of the touch's currentSendDate. " +
        "touchId must be one of the provided touchIds. Treat your own count estimates as advisory — the server will recompute. " +
        'Return JSON of the form: {"suggestions": [{"touchId": 1, "proposedSendDate": "2026-03-11", "rationale": "..."}]}\n\n' +
        JSON.stringify(facts, null, 2),
      maxTokens: 1200,
    });
    usage = { input: data.inputTokens, output: data.outputTokens, ok: true };

    const rawCandidates = Array.isArray(data.value.suggestions) ? data.value.suggestions : [];
    const validIdSet = new Set(planned.map((p) => p.id));
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const isRealCalendarDate = (iso: string): boolean => {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    };
    const sanitized: DateShiftCandidate[] = [];
    for (const s of rawCandidates) {
      const tid = Number(s?.touchId);
      const proposed = String(s?.proposedSendDate ?? "");
      if (!validIdSet.has(tid)) continue;
      if (!ISO_DATE.test(proposed)) continue;
      if (!isRealCalendarDate(proposed)) continue;
      const original = planned.find((p) => p.id === tid)!;
      if (!isWithinShiftWindow(original.sendDate, proposed)) continue;
      if (proposed < todayISO) continue;
      if (proposed === original.sendDate) continue;
      sanitized.push({ touchId: tid, proposedSendDate: proposed, rationale: String(s.rationale ?? "") });
    }

    const suggestions = filterDateShiftCandidates({
      planned,
      audienceByTouch,
      thresholds,
      thresholdsWithAction,
      history,
      overrides,
      currentExcluded,
      candidates: sanitized,
    });

    res.json({
      generatedAt: new Date().toISOString(),
      currentExcludedCount: currentExcluded,
      suggestions,
    });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "suggest-date-shifts",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_suggest_date_shifts",
        entityType: "campaign",
        entityId: id,
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

router.post("/ai/classify-suppression-reason", requireAuth, async (req, res): Promise<void> => {
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const body = AiClassifySuppressionReasonBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    assertNoPii(body.data.text, "text");

    const reasons = await db
      .select()
      .from(suppressionReasonCodesTable)
      .where(eq(suppressionReasonCodesTable.active, true))
      .orderBy(desc(suppressionReasonCodesTable.systemDefault));

    if (reasons.length === 0) {
      res.json({ generatedAt: new Date().toISOString(), suggestions: [] });
      return;
    }

    const data = await completeJson<{
      suggestions: { reasonCodeId: number; confidence: number; rationale: string }[];
    }>({
      system:
        "You classify free-text staff notes into one of a fixed list of suppression reason codes. " +
        "Output STRICT JSON only — no prose, no Markdown, no backticks. " +
        "Return up to 3 ranked suggestions. Confidence is a number between 0 and 1.",
      user:
        "Given the staff note and the list of reason codes, return JSON of the form: " +
        '{"suggestions": [{"reasonCodeId": 1, "confidence": 0.9, "rationale": "..."}]}\n\n' +
        "Staff note:\n" + body.data.text.trim() + "\n\n" +
        "Reason codes:\n" +
        JSON.stringify(reasons.map((r) => ({ id: r.id, name: r.name, description: r.description })), null, 2),
      maxTokens: 800,
    });
    usage = { input: data.inputTokens, output: data.outputTokens, ok: true };

    const byId = new Map(reasons.map((r) => [r.id, r]));
    const suggestions = (Array.isArray(data.value.suggestions) ? data.value.suggestions : [])
      .map((s) => {
        const code = byId.get(Number(s.reasonCodeId));
        if (!code) return null;
        const confidence = Math.max(0, Math.min(1, Number(s.confidence) || 0));
        return {
          reasonCodeId: code.id,
          reasonName: code.name,
          confidence,
          rationale: String(s.rationale ?? ""),
        };
      })
      .filter((s): s is { reasonCodeId: number; reasonName: string; confidence: number; rationale: string } => s !== null)
      .slice(0, 3);

    res.json({ generatedAt: new Date().toISOString(), suggestions });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "classify-suppression-reason",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_classify_reason",
        entityType: "suppression_reason_code",
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

// ───────── AI suggest override-reason
//
// Generates a 1-2 sentence justification template for overriding a flagged
// threshold conflict. Takes only the threshold rule id + projected count —
// no donor id, no audience id, no PII. The output is meant to be a copyable
// starting point that staff edit before saving as their override rationale.

interface OverrideReasonFacts {
  thresholdName: string;
  scope: string;
  windowDays: number;
  maxAllowed: number;
  projectedCount: number;
  channelLabel: string | null;
  campaignTypeLabel: string | null;
}

export function buildOverrideReasonPrompt(facts: OverrideReasonFacts): { system: string; user: string } {
  return {
    system:
      "You are an advancement-operations assistant for NC State University. " +
      "You write a SHORT (1-2 sentence, max 320 characters) justification template that a staff member can edit and use as the documented reason for OVERRIDING a flagged communication-volume threshold for a single constituent. " +
      "Write in plain professional English. Do not mention any constituent names, ids, emails, or other identifying information — you have not been given any. " +
      "Frame the suggestion as a starting point: explain why the additional touch could be defensible (e.g. high-priority, time-sensitive, no other channel reached them), and remind the reader to add campaign-specific context.",
    user:
      "Write a 1-2 sentence override-justification template for the following threshold breach. " +
      "Reference the rule by its name, the limit, and the projected count. " +
      "End with a short reminder that the reviewer should add specific business context.\n\n" +
      JSON.stringify(facts, null, 2),
  };
}

router.post("/campaigns/:id/ai/suggest-override-reason", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const body = AiSuggestOverrideReasonBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    const { thresholdId, projectedCount } = body.data;

    const [rule] = await db
      .select()
      .from(thresholdsTable)
      .where(eq(thresholdsTable.id, thresholdId));
    if (!rule || rule.campaignId !== id) {
      res.status(404).json({ error: "Threshold not found" });
      return;
    }

    let channelLabel: string | null = null;
    if (rule.channelId != null) {
      const [c] = await db.select({ name: channelsTable.name }).from(channelsTable).where(eq(channelsTable.id, rule.channelId));
      channelLabel = c?.name ?? null;
    }
    let campaignTypeLabel: string | null = null;
    if (rule.campaignTypeId != null) {
      const [t] = await db.select({ name: campaignTypesTable.name }).from(campaignTypesTable).where(eq(campaignTypesTable.id, rule.campaignTypeId));
      campaignTypeLabel = t?.name ?? null;
    }

    const facts: OverrideReasonFacts = {
      thresholdName: rule.name,
      scope: rule.scope,
      windowDays: rule.windowDays,
      maxAllowed: rule.maxTouchpoints,
      projectedCount,
      channelLabel,
      campaignTypeLabel,
    };
    assertNoPii(facts, "facts");

    const prompt = buildOverrideReasonPrompt(facts);
    const result = await complete({ ...prompt, maxTokens: 400 });
    usage = { input: result.inputTokens, output: result.outputTokens, ok: true };

    const reason = result.text.trim().slice(0, 600);
    res.json({ generatedAt: new Date().toISOString(), reason });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "suggest-override-reason",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_suggest_override_reason",
        entityType: "campaign",
        entityId: id,
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

// ───────── AI campaign-brief → structured setup
//
// Extract structured campaign-setup fields (name, type, owning unit, intended
// send date, suggested touches) from a free-text brief. Type and owning unit
// names suggested by the model are matched server-side against the active
// taxonomy — the model never invents ids.

interface BriefRawTouch {
  order?: number;
  channelLabel?: string;
  dayOffset?: number;
  purpose?: string;
}
export interface BriefRawExtraction {
  name?: string;
  owningUnit?: string | null;
  intendedSendStartDate?: string | null;
  campaignTypeNames?: string[];
  touches?: BriefRawTouch[];
  notes?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Real calendar-date check: the input must be ISO YYYY-MM-DD AND round-trip
 * through `Date` to the same string. Rejects regex-passable but impossible
 * dates like 2026-99-99 or 2026-02-30 so the model cannot smuggle nonsense
 * into the campaign setup form.
 */
function isValidIsoCalendarDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Lowercase + collapse whitespace for fuzzy taxonomy matching. */
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Score a model-suggested name against an authoritative taxonomy entry.
 * Returns a confidence in [0, 1]: 1 = exact (case-insensitive), 0.85 = one
 * is a substring of the other, 0 = no overlap.
 */
export function fuzzyMatchScore(suggested: string, candidate: string): number {
  const a = normalizeLabel(suggested);
  const b = normalizeLabel(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return 0;
}

export interface BriefMatchOptions {
  channels: { name: string }[];
  types: { id: number; name: string }[];
  units: { name: string }[];
  briefMaxTouches?: number;
}

export interface BriefMatchResult {
  name: string;
  owningUnit: string | null;
  intendedSendStartDate: string | null;
  campaignTypeIds: number[];
  campaignTypeMatches: { id: number; name: string; confidence: number }[];
  owningUnitMatch: { name: string; confidence: number } | null;
  touches: { order: number; channelLabel: string; dayOffset: number; purpose: string }[];
  notes: string;
}

/**
 * Pure helper that takes the model's raw extraction plus the active taxonomy
 * and produces the response shape — applying fuzzy matching, channel
 * filtering, and bounds. Exported so it can be unit-tested without spinning
 * up the AI provider.
 */
export function matchBriefExtraction(raw: BriefRawExtraction, opts: BriefMatchOptions): BriefMatchResult {
  const cap = opts.briefMaxTouches ?? 6;
  const name = String(raw.name ?? "").trim().slice(0, 200);

  // Type matches: keep at confidence >= 0.5, dedupe by id, preserve highest score.
  const typeScores = new Map<number, { id: number; name: string; confidence: number }>();
  for (const sn of raw.campaignTypeNames ?? []) {
    if (typeof sn !== "string" || !sn.trim()) continue;
    let best: { id: number; name: string; confidence: number } | null = null;
    for (const t of opts.types) {
      const score = fuzzyMatchScore(sn, t.name);
      if (score >= 0.5 && (!best || score > best.confidence)) {
        best = { id: t.id, name: t.name, confidence: score };
      }
    }
    if (best) {
      const prev = typeScores.get(best.id);
      if (!prev || best.confidence > prev.confidence) typeScores.set(best.id, best);
    }
  }
  const campaignTypeMatches = Array.from(typeScores.values()).sort((a, b) => b.confidence - a.confidence);

  // Owning unit: best single fuzzy match >= 0.5.
  let owningUnitMatch: { name: string; confidence: number } | null = null;
  const suggestedUnit = typeof raw.owningUnit === "string" ? raw.owningUnit : null;
  if (suggestedUnit) {
    for (const u of opts.units) {
      const score = fuzzyMatchScore(suggestedUnit, u.name);
      if (score >= 0.5 && (!owningUnitMatch || score > owningUnitMatch.confidence)) {
        owningUnitMatch = { name: u.name, confidence: score };
      }
    }
  }

  // Date: keep only ISO YYYY-MM-DD; drop anything else (avoids fabricated dates).
  let intendedSendStartDate: string | null = null;
  if (typeof raw.intendedSendStartDate === "string" && isValidIsoCalendarDate(raw.intendedSendStartDate)) {
    intendedSendStartDate = raw.intendedSendStartDate;
  }

  // Touches: filter to active channel labels, clamp dayOffset, cap count.
  const channelLabels = new Set(opts.channels.map((c) => c.name));
  const touches = (raw.touches ?? [])
    .filter((t): t is BriefRawTouch => !!t && typeof t.channelLabel === "string" && channelLabels.has(t.channelLabel))
    .slice(0, cap)
    .map((t, i) => ({
      order: Number.isFinite(Number(t.order)) ? Number(t.order) : i + 1,
      channelLabel: String(t.channelLabel),
      dayOffset: Math.max(0, Math.floor(Number(t.dayOffset) || 0)),
      purpose: String(t.purpose ?? "").slice(0, 200),
    }));

  return {
    name,
    owningUnit: owningUnitMatch?.name ?? null,
    intendedSendStartDate,
    campaignTypeIds: campaignTypeMatches.map((m) => m.id),
    campaignTypeMatches,
    owningUnitMatch,
    touches,
    notes: String(raw.notes ?? "").slice(0, 600),
  };
}

export function buildCampaignBriefPrompt(opts: {
  brief: string;
  channels: { name: string }[];
  types: { name: string }[];
  units: { name: string }[];
}): { system: string; user: string } {
  return {
    system:
      "You are an advancement-operations assistant for NC State University. " +
      "Extract structured campaign-setup fields from a free-text staff brief. " +
      "Output STRICT JSON only — no prose, no Markdown, no backticks. " +
      "If a field cannot be inferred, return null (or [] for arrays). Never invent dates, names, or counts.",
    user:
      "Read the brief and return JSON of the form: " +
      '{"name": "...", "owningUnit": "..." | null, "intendedSendStartDate": "YYYY-MM-DD" | null, "campaignTypeNames": ["..."], "touches": [{"order": 1, "channelLabel": "Email", "dayOffset": 0, "purpose": "..."}], "notes": "..."}\n\n' +
      "Rules:\n" +
      "- name: a short campaign title (max 200 chars). Required if discernible.\n" +
      "- owningUnit: the single best match from the unit list below, or null. Use the EXACT name as written in the list.\n" +
      "- intendedSendStartDate: ISO YYYY-MM-DD if explicitly stated; otherwise null. Do not guess.\n" +
      "- campaignTypeNames: 0-3 names from the type list below, ranked best first. Use the EXACT names from the list.\n" +
      "- touches: 0-6 planned communication touches. channelLabel MUST be one of the channel names below. dayOffset is a non-negative integer (0 = the start date).\n" +
      "- notes: optional 1-2 sentence summary of any caveats or open questions.\n\n" +
      "Channels (allowed channelLabel values):\n" + JSON.stringify(opts.channels.map((c) => c.name)) + "\n\n" +
      "Campaign types:\n" + JSON.stringify(opts.types.map((t) => t.name)) + "\n\n" +
      "Owning units:\n" + JSON.stringify(opts.units.map((u) => u.name)) + "\n\n" +
      "Brief:\n" + opts.brief.trim(),
  };
}

router.post("/ai/campaign-brief", requireAuth, async (req, res): Promise<void> => {
  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;
    const body = AiCampaignBriefBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
    assertNoPii(body.data.brief, "brief");

    const [channels, types, units] = await Promise.all([
      db.select({ name: channelsTable.name }).from(channelsTable).where(eq(channelsTable.active, true)),
      db.select({ id: campaignTypesTable.id, name: campaignTypesTable.name }).from(campaignTypesTable).where(eq(campaignTypesTable.active, true)),
      db.select({ name: owningUnitsTable.name }).from(owningUnitsTable).where(eq(owningUnitsTable.active, true)),
    ]);

    const prompt = buildCampaignBriefPrompt({ brief: body.data.brief, channels, types, units });
    // Defense-in-depth: scan the full outbound prompt (brief + DB-sourced
    // taxonomy labels) so a polluted taxonomy row can never silently
    // exfiltrate PII to the model.
    assertNoPii(prompt, "campaignBriefPrompt");
    const data = await completeJson<BriefRawExtraction>({ ...prompt, maxTokens: 1500 });
    usage = { input: data.inputTokens, output: data.outputTokens, ok: true };

    const matched = matchBriefExtraction(data.value, { channels, types, units });
    res.json({ generatedAt: new Date().toISOString(), ...matched });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "campaign-brief",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_brief_to_campaign",
        entityType: "campaign",
        details: `model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

// Read current AI usage for the calling user so the UI can display headroom.
router.get("/ai/usage", requireAuth, async (req, res): Promise<void> => {
  const { getDailyAiTokenUsage } = await import("../lib/ai");
  const used = await getDailyAiTokenUsage(req.currentUser!.id);
  res.json({ used, budget: AI_DAILY_TOKEN_BUDGET, remaining: Math.max(0, AI_DAILY_TOKEN_BUDGET - used) });
});

export default router;
