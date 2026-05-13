import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { auditLogTable } from "@workspace/db";

/**
 * Canonical audit-log action vocabulary. Used to validate `action[]`
 * filter input on `GET /audit-log` and to populate the multi-select
 * filter in the UI. Keep in sync with `audit({ action })` call sites.
 */
export const AUDIT_ACTIONS = [
  "acknowledge_pii",
  "ai_audience_summary",
  "ai_brief_to_campaign",
  "ai_classify_reason",
  "ai_suggest_cadence",
  "ai_suggest_date_shifts",
  "ai_suggest_override_reason",
  "apply_threshold_templates",
  "archive_campaign",
  "campaign_cloned",
  "change_own_password",
  "clear_touch_audience",
  "create_campaign",
  "create_campaign_type",
  "create_channel",
  "create_owning_unit",
  "create_saved_report_view",
  "create_seed_group",
  "create_suppression",
  "create_suppression_reason",
  "create_threshold",
  "create_threshold_template",
  "create_touch",
  "create_user",
  "delete_campaign",
  "delete_seed_group",
  "delete_suppression",
  "delete_threshold",
  "delete_threshold_template",
  "delete_touch",
  "delete_user",
  "export_campaign",
  "finalize_campaign",
  "recovery_code_used",
  "recovery_codes_regenerated",
  "resend_invite",
  "reset_password",
  "retention_delete",
  "retention_scheduled_run",
  "self_service_password_reset_requested",
  "set_overrides",
  "totp_disabled",
  "totp_enrolled",
  "totp_reset",
  "totp_used",
  "touch_date_manual_undone",
  "touch_date_shift_applied",
  "touch_date_shift_undone",
  "update_campaign",
  "update_campaign_type",
  "update_channel",
  "update_owning_unit",
  "update_settings",
  "update_suppression_reason",
  "update_threshold",
  "update_threshold_template",
  "update_touch",
  "update_user",
  "upload_audience",
  "upload_touch_audience",
  "void_campaign",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
const AUDIT_ACTION_SET: ReadonlySet<string> = new Set(AUDIT_ACTIONS);

/** Hard cap on rows in a single CSV export — defends against an
 *  authenticated admin scraping the entire audit history in one click. */
export const MAX_AUDIT_EXPORT_ROWS = 50_000;

/** Default page size for cursor-paginated browse. */
export const DEFAULT_PAGE_SIZE = 50;
/** Hard ceiling on `limit` to keep responses bounded. */
export const MAX_PAGE_SIZE = 200;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

export interface AuditFilters {
  actorId?: number;
  /** Empty array means "any action" — apply no filter. */
  actions?: AuditAction[];
  campaignId?: number;
  targetUserId?: number;
  /** YYYY-MM-DD inclusive lower bound. */
  from?: string;
  /** YYYY-MM-DD inclusive upper bound (exclusive end-of-day applied internally). */
  to?: string;
  /** Free-text search over action, entityType, actorName, details. */
  q?: string;
}

export interface AuditCursor {
  ts: number;
  id: number;
}

export type AuditQueryError =
  | { kind: "bad_date"; field: "from" | "to" }
  | { kind: "date_order" }
  | { kind: "bad_action"; value: string }
  | { kind: "bad_int"; field: "actorId" | "campaignId" | "targetUserId" | "limit" }
  | { kind: "bad_cursor" };

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AuditQueryError };

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function asInt(v: unknown): number | undefined {
  const s = asString(v);
  if (s === undefined) return undefined;
  if (!/^\d+$/.test(s)) return NaN; // signal "present but invalid"
  return Number(s);
}

function asActionList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.flatMap((x) => (typeof x === "string" ? [x] : []));
  if (typeof v === "string") {
    // Support both `?action=a&action=b` (Express → array) and `?action=a,b`.
    return v.includes(",") ? v.split(",").map((s) => s.trim()).filter(Boolean) : [v.trim()].filter(Boolean);
  }
  return [];
}

export function parseAuditFilters(
  query: Record<string, unknown>,
): ParseResult<AuditFilters> {
  const filters: AuditFilters = {};

  const actorId = asInt(query.actorId);
  if (actorId !== undefined) {
    if (Number.isNaN(actorId)) return { ok: false, error: { kind: "bad_int", field: "actorId" } };
    filters.actorId = actorId;
  }

  const campaignId = asInt(query.campaignId);
  if (campaignId !== undefined) {
    if (Number.isNaN(campaignId)) return { ok: false, error: { kind: "bad_int", field: "campaignId" } };
    filters.campaignId = campaignId;
  }

  const targetUserId = asInt(query.targetUserId);
  if (targetUserId !== undefined) {
    if (Number.isNaN(targetUserId)) return { ok: false, error: { kind: "bad_int", field: "targetUserId" } };
    filters.targetUserId = targetUserId;
  }

  const from = asString(query.from);
  if (from !== undefined) {
    if (!isValidIsoDate(from)) return { ok: false, error: { kind: "bad_date", field: "from" } };
    filters.from = from;
  }
  const to = asString(query.to);
  if (to !== undefined) {
    if (!isValidIsoDate(to)) return { ok: false, error: { kind: "bad_date", field: "to" } };
    filters.to = to;
  }
  if (filters.from && filters.to && filters.from > filters.to) {
    return { ok: false, error: { kind: "date_order" } };
  }

  const actions = asActionList(query.action);
  if (actions.length) {
    for (const a of actions) {
      if (!AUDIT_ACTION_SET.has(a)) {
        return { ok: false, error: { kind: "bad_action", value: a } };
      }
    }
    filters.actions = actions as AuditAction[];
  }

  const q = asString(query.q);
  if (q !== undefined) filters.q = q;

  return { ok: true, value: filters };
}

export function parseLimit(raw: unknown, fallback = DEFAULT_PAGE_SIZE): ParseResult<number> {
  const n = asInt(raw);
  if (n === undefined) return { ok: true, value: fallback };
  if (Number.isNaN(n) || n < 1) return { ok: false, error: { kind: "bad_int", field: "limit" } };
  return { ok: true, value: Math.min(n, MAX_PAGE_SIZE) };
}

/** Cursor: base64url("<ts-ms>:<id>"). Opaque to the client. */
export function encodeCursor(c: AuditCursor): string {
  return Buffer.from(`${c.ts}:${c.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): ParseResult<AuditCursor> {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return { ok: false, error: { kind: "bad_cursor" } };
  }
  const m = /^(\d+):(\d+)$/.exec(decoded);
  if (!m) return { ok: false, error: { kind: "bad_cursor" } };
  const ts = Number(m[1]);
  const id = Number(m[2]);
  if (!Number.isFinite(ts) || !Number.isFinite(id)) {
    return { ok: false, error: { kind: "bad_cursor" } };
  }
  return { ok: true, value: { ts, id } };
}

/** Escape `%` and `_` so user-supplied free text can't widen an `ilike`. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function buildAuditWhere(filters: AuditFilters): SQL | undefined {
  const parts: SQL[] = [];

  if (filters.actorId !== undefined) {
    parts.push(eq(auditLogTable.actorUserId, filters.actorId));
  }
  if (filters.actions && filters.actions.length) {
    parts.push(inArray(auditLogTable.action, filters.actions));
  }
  if (filters.campaignId !== undefined) {
    parts.push(
      and(
        eq(auditLogTable.entityType, "campaign"),
        eq(auditLogTable.entityId, filters.campaignId),
      )!,
    );
  }
  if (filters.targetUserId !== undefined) {
    parts.push(
      and(
        eq(auditLogTable.entityType, "user"),
        eq(auditLogTable.entityId, filters.targetUserId),
      )!,
    );
  }
  if (filters.from) {
    parts.push(gte(auditLogTable.createdAt, new Date(`${filters.from}T00:00:00Z`)));
  }
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    parts.push(lt(auditLogTable.createdAt, end));
  }
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    const orExpr = or(
      ilike(auditLogTable.details, like),
      ilike(auditLogTable.action, like),
      ilike(auditLogTable.entityType, like),
      ilike(auditLogTable.actorName, like),
    );
    if (orExpr) parts.push(orExpr);
  }

  if (!parts.length) return undefined;
  return and(...parts);
}

/** Stable order: timestamp desc tiebroken by id desc (newest-first). */
export const AUDIT_ORDER = [desc(auditLogTable.createdAt), desc(auditLogTable.id)];

/** Cursor predicate for keyset pagination matching AUDIT_ORDER:
 *  rows strictly older than the cursor row. */
export function buildCursorPredicate(c: AuditCursor): SQL {
  const cursorDate = new Date(c.ts);
  return or(
    lt(auditLogTable.createdAt, cursorDate),
    and(eq(auditLogTable.createdAt, cursorDate), lt(auditLogTable.id, c.id))!,
  )!;
}

export function combineWhere(a: SQL | undefined, b: SQL | undefined): SQL | undefined {
  if (a && b) return and(a, b);
  return a ?? b;
}

/** Convenience: shape a row for the `AuditEntry` API contract. */
export interface AuditEntryDto {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
}

export function toAuditEntryDto(r: {
  id: number;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: Date;
}): AuditEntryDto {
  return {
    id: r.id,
    actorName: r.actorName,
    actorRole: r.actorRole,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Map an internal parse error to a (status, body) pair for the route layer. */
export function errorResponse(err: AuditQueryError): { status: number; body: { error: string; code?: string } } {
  switch (err.kind) {
    case "bad_date":
      return { status: 400, body: { error: `Invalid ${err.field} (expected YYYY-MM-DD)` } };
    case "date_order":
      return { status: 400, body: { error: "from must be on or before to" } };
    case "bad_action":
      return { status: 400, body: { error: `Unknown action: ${err.value}`, code: "bad_action" } };
    case "bad_int":
      return { status: 400, body: { error: `Invalid ${err.field} (expected positive integer)` } };
    case "bad_cursor":
      return { status: 400, body: { error: "Invalid cursor", code: "bad_cursor" } };
  }
}
