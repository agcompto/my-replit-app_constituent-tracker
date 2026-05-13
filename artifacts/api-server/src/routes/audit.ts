import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireRole } from "../lib/auth";
import { buildCsv } from "../lib/donor";
import {
  AUDIT_ORDER,
  MAX_AUDIT_EXPORT_ROWS,
  buildAuditWhere,
  buildCursorPredicate,
  combineWhere,
  decodeCursor,
  encodeCursor,
  errorResponse,
  parseAuditFilters,
  parseLimit,
  toAuditEntryDto,
} from "../lib/auditLog";

const router: IRouter = Router();

// Audit log exposes actor names, roles, and the full timeline of administrative
// actions (user invites, password resets, deletes, settings changes, retention
// runs). That is privileged operational data and must not be readable by
// standard staff users — only admins/super-admins.
router.get(
  "/audit-log",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const filtersRes = parseAuditFilters(req.query as Record<string, unknown>);
    if (!filtersRes.ok) {
      const { status, body } = errorResponse(filtersRes.error);
      res.status(status).json(body);
      return;
    }
    const limitRes = parseLimit(req.query.limit);
    if (!limitRes.ok) {
      const { status, body } = errorResponse(limitRes.error);
      res.status(status).json(body);
      return;
    }
    const limit = limitRes.value;

    const baseWhere = buildAuditWhere(filtersRes.value);

    let cursorWhere = baseWhere;
    if (typeof req.query.cursor === "string" && req.query.cursor) {
      const cur = decodeCursor(req.query.cursor);
      if (!cur.ok) {
        const { status, body } = errorResponse(cur.error);
        res.status(status).json(body);
        return;
      }
      cursorWhere = combineWhere(baseWhere, buildCursorPredicate(cur.value));
    }

    // Fetch limit+1 to know if a next page exists without an extra round-trip.
    const rowsQ = db
      .select()
      .from(auditLogTable)
      .where(cursorWhere ?? sql`true`)
      .orderBy(...AUDIT_ORDER)
      .limit(limit + 1);

    const countQ = db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .where(baseWhere ?? sql`true`);

    const [rows, countRows] = await Promise.all([rowsQ, countQ]);
    const totalCount = countRows[0]?.n ?? 0;

    let nextCursor: string | null = null;
    let page = rows;
    if (rows.length > limit) {
      page = rows.slice(0, limit);
      const last = page[page.length - 1];
      nextCursor = encodeCursor({ ts: last.createdAt.getTime(), id: last.id });
    }

    res.json({
      items: page.map(toAuditEntryDto),
      nextCursor,
      totalCount,
    });
  },
);

router.get(
  "/audit-log/export.csv",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const filtersRes = parseAuditFilters(req.query as Record<string, unknown>);
    if (!filtersRes.ok) {
      const { status, body } = errorResponse(filtersRes.error);
      res.status(status).json(body);
      return;
    }
    const where = buildAuditWhere(filtersRes.value);

    // Count first so we can refuse cleanly with 413 instead of half-streaming a CSV.
    const countRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .where(where ?? sql`true`);
    const total = countRows[0]?.n ?? 0;
    if (total > MAX_AUDIT_EXPORT_ROWS) {
      res.status(413).json({
        error: `Filter matches ${total.toLocaleString()} rows, which exceeds the export cap of ${MAX_AUDIT_EXPORT_ROWS.toLocaleString()}. Narrow the filter and try again.`,
        code: "audit_export_row_cap_exceeded",
        totalCount: total,
        maxRows: MAX_AUDIT_EXPORT_ROWS,
      });
      return;
    }

    const rows = await db
      .select()
      .from(auditLogTable)
      .where(where ?? sql`true`)
      .orderBy(...AUDIT_ORDER)
      .limit(MAX_AUDIT_EXPORT_ROWS);

    const csv = buildCsv(
      ["id", "createdAt", "actorName", "actorRole", "action", "entityType", "entityId", "details"],
      rows.map((r) => [
        r.id,
        r.createdAt.toISOString(),
        r.actorName,
        r.actorRole,
        r.action,
        r.entityType,
        r.entityId ?? "",
        r.details ?? "",
      ]),
    );

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-log-${stamp}.csv"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
  },
);

export default router;
