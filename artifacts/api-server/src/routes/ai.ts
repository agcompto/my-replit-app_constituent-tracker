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
import { AiClassifySuppressionReasonBody } from "@workspace/api-zod";
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

// Read current AI usage for the calling user so the UI can display headroom.
router.get("/ai/usage", requireAuth, async (req, res): Promise<void> => {
  const { getDailyAiTokenUsage } = await import("../lib/ai");
  const used = await getDailyAiTokenUsage(req.currentUser!.id);
  res.json({ used, budget: AI_DAILY_TOKEN_BUDGET, remaining: Math.max(0, AI_DAILY_TOKEN_BUDGET - used) });
});

export default router;
