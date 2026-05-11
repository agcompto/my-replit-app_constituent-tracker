import Anthropic from "@anthropic-ai/sdk";
import { and, gte, eq, sql } from "drizzle-orm";
import { db, appSettingsTable, aiUsageTable } from "@workspace/db";

export const MODEL = "claude-sonnet-4-6";

// Per-user daily AI cost ceiling (in tokens). Both input + output count.
// Picked to be generous for human-driven UI use but block runaway loops.
export const AI_DAILY_TOKEN_BUDGET = 200_000;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseURL || !apiKey) {
    throw new Error("Anthropic AI integration is not configured.");
  }
  client = new Anthropic({ baseURL, apiKey });
  return client;
}

export class AiDisabledError extends Error {
  constructor() {
    super("AI assist is disabled in system settings.");
    this.name = "AiDisabledError";
  }
}

export class AiPiiBlockedError extends Error {
  constructor(public kinds: string[]) {
    super(`Input appears to contain PII (${kinds.join(", ")}). AI calls reject this kind of content.`);
    this.name = "AiPiiBlockedError";
  }
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const DONOR_ID_RE = /\b\d{6,}\b/;

/**
 * Inspect arbitrary text/objects bound for the AI provider and throw if any
 * value matches a PII pattern. We block entirely rather than silently redact —
 * the surrounding feature contracts only allow operating on non-PII inputs.
 */
export function assertNoPii(payload: unknown, fieldPath = "input"): void {
  const flat: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") flat.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(payload);
  const kinds = new Set<string>();
  for (const s of flat) {
    if (EMAIL_RE.test(s)) kinds.add("email");
    if (PHONE_RE.test(s)) kinds.add("phone");
    if (SSN_RE.test(s)) kinds.add("ssn");
    if (DONOR_ID_RE.test(s)) kinds.add("constituent id");
  }
  if (kinds.size > 0) {
    const err = new AiPiiBlockedError(Array.from(kinds));
    err.message = `${fieldPath}: ${err.message}`;
    throw err;
  }
}

export async function ensureAiEnabled(): Promise<void> {
  const [s] = await db.select().from(appSettingsTable).limit(1);
  if (!s?.aiAssistEnabled) {
    throw new AiDisabledError();
  }
}

export interface AiCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Run a single Anthropic completion. Returns the reply plus token usage. */
export async function complete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<AiCompletion> {
  const c = getClient();
  const response = await c.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 8192,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const parts: string[] = [];
  for (const block of response.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return {
    text: parts.join("\n").trim(),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}

/** Run an Anthropic completion and parse the response as JSON. Strips ```json fences if present. */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ value: T; inputTokens: number; outputTokens: number }> {
  const r = await complete(opts);
  let cleaned = r.text.trim();
  // Strip optional ```json ... ``` fences the model sometimes emits.
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/m.exec(cleaned);
  if (fence) cleaned = fence[1].trim();
  try {
    return {
      value: JSON.parse(cleaned) as T,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    };
  } catch (err) {
    throw new Error(
      `AI response was not valid JSON: ${(err as Error).message}\nRaw: ${r.text.slice(0, 500)}`,
    );
  }
}

/**
 * Return today's token usage (input + output) for a user. "Today" is a UTC
 * 24-hour rolling window for simplicity (avoids timezone confusion in audit
 * data; matches how Anthropic itself bills).
 */
export async function getDailyAiTokenUsage(userId: number): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageTable.inputTokens} + ${aiUsageTable.outputTokens}), 0)::int`,
    })
    .from(aiUsageTable)
    .where(
      and(eq(aiUsageTable.userId, userId), gte(aiUsageTable.createdAt, since)),
    );
  return row?.total ?? 0;
}

export class AiBudgetExceededError extends Error {
  constructor(public used: number, public budget: number) {
    super(
      `Daily AI token budget exceeded (${used}/${budget}). Try again tomorrow or ask an admin to raise the cap.`,
    );
    this.name = "AiBudgetExceededError";
  }
}

/** Reject the call before it goes out if the user is already over budget. */
export async function ensureUnderDailyBudget(userId: number): Promise<void> {
  const used = await getDailyAiTokenUsage(userId);
  if (used >= AI_DAILY_TOKEN_BUDGET) {
    throw new AiBudgetExceededError(used, AI_DAILY_TOKEN_BUDGET);
  }
}

/** Persist a usage row. Failures are logged but never thrown — they must not break the user-visible flow. */
export async function recordAiUsage(args: {
  userId: number;
  route: string;
  inputTokens: number;
  outputTokens: number;
  succeeded: boolean;
}): Promise<void> {
  try {
    await db.insert(aiUsageTable).values({
      userId: args.userId,
      route: args.route,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      succeeded: args.succeeded,
    });
  } catch {
    // intentional swallow — accounting failures must not break user flows
  }
}
