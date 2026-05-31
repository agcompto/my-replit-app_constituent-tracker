import { Router, type IRouter } from "express";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, campaignsTable, campaignTypesTable, channelsTable, touchpointsTable } from "@workspace/db";
import { requireAuth, audit } from "../lib/auth";
import { normalizeDonorId } from "../lib/donor";
import { checkAiPerMinute } from "../lib/rateLimit";
import {
  AI_DAILY_TOKEN_BUDGET,
  AiBudgetExceededError,
  AiDisabledError,
  AiPiiBlockedError,
  MODEL,
  assertNoPii,
  completeJson,
  ensureAiEnabled,
  ensureUnderDailyBudget,
  recordAiUsage,
} from "../lib/ai";

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
  log.error({ err }, "AI constituent summary request failed");
  res.status(502).json({ error: "AI request failed" });
}

async function gateAiRequest(req: import("express").Request, res: import("express").Response): Promise<boolean> {
  await ensureAiEnabled();
  const userId = req.currentUser!.id;
  const rate = checkAiPerMinute(userId);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSec));
    res.status(429).json({ error: `AI rate limit exceeded. Try again in ${rate.retryAfterSec}s.` });
    return false;
  }
  await ensureUnderDailyBudget(userId);
  return true;
}

async function fetchConstituentTouchpoints(constituentId: string, filters: FilterParams) {
  const conditions = [eq(touchpointsTable.donorId, constituentId)];
  if (filters.startDate) conditions.push(gte(touchpointsTable.sendDate, filters.startDate as any));
  if (filters.endDate) conditions.push(lte(touchpointsTable.sendDate, filters.endDate as any));
  if (filters.channelIds?.length) conditions.push(inArray(touchpointsTable.channelId, filters.channelIds));
  if (filters.campaignTypeIds?.length) conditions.push(inArray(touchpointsTable.campaignTypeId, filters.campaignTypeIds));
  if (filters.countsTowardThresholdOnly === true) conditions.push(eq(touchpointsTable.countsTowardThreshold, true));

  const rows = await db
    .select()
    .from(touchpointsTable)
    .where(and(...conditions))
    .orderBy(touchpointsTable.sendDate)
    .limit(2000);

  const [channels, types] = await Promise.all([
    db.select().from(channelsTable),
    db.select().from(campaignTypesTable),
  ]);

  const campaignIds = Array.from(new Set(rows.map((row) => row.campaignId)));
  const campaigns = campaignIds.length
    ? await db.select().from(campaignsTable).where(inArray(campaignsTable.id, campaignIds))
    : [];

  const filteredRows = filters.statuses?.length
    ? rows.filter((row) => {
        const campaign = campaigns.find((item) => item.id === row.campaignId);
        const status = campaign?.status ?? "unknown";
        return filters.statuses!.includes(status);
      })
    : rows;

  return filteredRows.map((row) => {
    const campaign = campaigns.find((item) => item.id === row.campaignId);
    const channel = channels.find((item) => item.id === row.channelId);
    const campaignType = types.find((item) => item.id === row.campaignTypeId);
    const sendDate = typeof row.sendDate === "string" ? row.sendDate : (row.sendDate as Date).toISOString().slice(0, 10);
    return {
      campaignStatus: campaign?.status ?? "unknown",
      channelId: row.channelId,
      channelLabel: channel?.name ?? "Unknown",
      campaignTypeId: row.campaignTypeId,
      campaignTypeLabel: campaignType?.name ?? "Unknown",
      sendDate,
      countsTowardThreshold: row.countsTowardThreshold,
    };
  });
}

function summarizeCounts<T extends string | number>(items: T[]): Array<{ value: T; count: number }> {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
}

router.post("/donors/:donorId/ai/summary", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.donorId) ? req.params.donorId[0] : req.params.donorId;
  const constituentId = normalizeDonorId(raw);
  if (!constituentId) {
    res.status(400).json({ error: "Constituent ID must be 1-8 digits" });
    return;
  }

  let usage = { input: 0, output: 0, ok: false };
  try {
    if (!(await gateAiRequest(req, res))) return;

    const filters = parseFilterParams(req.query as Record<string, unknown>);
    const touchpoints = await fetchConstituentTouchpoints(constituentId, filters);
    const dates = touchpoints.map((touchpoint) => touchpoint.sendDate).sort();
    const earliestDate = dates[0] ?? null;
    const mostRecentDate = dates[dates.length - 1] ?? null;

    const facts = {
      totalTouchpoints: touchpoints.length,
      earliestDate,
      mostRecentDate,
      byChannel: summarizeCounts(touchpoints.map((touchpoint) => touchpoint.channelLabel)),
      byCampaignType: summarizeCounts(touchpoints.map((touchpoint) => touchpoint.campaignTypeLabel)),
      byStatus: summarizeCounts(touchpoints.map((touchpoint) => touchpoint.campaignStatus)),
      thresholdCountingTouchpoints: touchpoints.filter((touchpoint) => touchpoint.countsTowardThreshold).length,
      recentTimeline: touchpoints.slice(-30).map((touchpoint) => ({
        sendDate: touchpoint.sendDate,
        channel: touchpoint.channelLabel,
        campaignType: touchpoint.campaignTypeLabel,
        status: touchpoint.campaignStatus,
        countsTowardThreshold: touchpoint.countsTowardThreshold,
      })),
    };

    // Do not send the constituent ID or free-text campaign names to the model.
    assertNoPii(facts, "constituentSummaryFacts");

    const result = await completeJson<{
      summary: string;
      risks: string[];
      recommendations: string[];
    }>({
      system:
        "You are a concise advancement-operations assistant. " +
        "Summarize constituent communication history for internal staff using only the structured metadata provided. " +
        "Output STRICT JSON only. Do not include Markdown or backticks. Do not invent facts. Do not mention names, email addresses, phone numbers, giving amounts, or other PII.",
      user:
        "Create a constituent communication summary from these facts. " +
        "Return JSON of the form: {\"summary\": \"...\", \"risks\": [\"...\"], \"recommendations\": [\"...\"]}. " +
        "Keep summary to 2-4 sentences, risks to at most 4 bullets, and recommendations to at most 4 bullets.\n\n" +
        JSON.stringify(facts, null, 2),
      maxTokens: 1000,
    });
    usage = { input: result.inputTokens, output: result.outputTokens, ok: true };

    res.json({
      generatedAt: new Date().toISOString(),
      summary: String(result.value.summary ?? ""),
      risks: Array.isArray(result.value.risks) ? result.value.risks.map(String).slice(0, 4) : [],
      recommendations: Array.isArray(result.value.recommendations) ? result.value.recommendations.map(String).slice(0, 4) : [],
    });
  } catch (err) {
    handleAiError(err, res, req.log);
  } finally {
    if (req.currentUser) {
      await recordAiUsage({
        userId: req.currentUser.id,
        route: "constituent-summary",
        inputTokens: usage.input,
        outputTokens: usage.output,
        succeeded: usage.ok,
      });
      await audit({
        actor: req.currentUser,
        action: "ai_constituent_summary",
        entityType: "donor",
        entityId: null,
        details: `constituent=${constituentId} model=${MODEL} in=${usage.input} out=${usage.output} ok=${usage.ok}`,
      });
    }
  }
});

export default router;
