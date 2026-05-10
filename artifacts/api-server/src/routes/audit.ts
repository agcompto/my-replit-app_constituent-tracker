import { Router, type IRouter } from "express";
import { and, desc, gte, ilike, lt, sql, type SQL } from "drizzle-orm";
import { db, auditLogTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

router.get("/audit-log", requireAuth, async (req, res): Promise<void> => {
  const parts: SQL[] = [];

  const actor = typeof req.query.actor === "string" ? req.query.actor.trim() : "";
  if (actor) parts.push(ilike(auditLogTable.actorName, `%${actor}%`));

  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  if (action) parts.push(ilike(auditLogTable.action, `%${action}%`));

  const entityType = typeof req.query.entityType === "string" ? req.query.entityType.trim() : "";
  if (entityType) parts.push(ilike(auditLogTable.entityType, `%${entityType}%`));

  const startDate = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  if (startDate) {
    if (!isValidIsoDate(startDate)) {
      res.status(400).json({ error: "Invalid startDate (expected YYYY-MM-DD)" });
      return;
    }
    parts.push(gte(auditLogTable.createdAt, new Date(`${startDate}T00:00:00Z`)));
  }

  const endDate = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";
  if (endDate) {
    if (!isValidIsoDate(endDate)) {
      res.status(400).json({ error: "Invalid endDate (expected YYYY-MM-DD)" });
      return;
    }
    if (startDate && startDate > endDate) {
      res.status(400).json({ error: "startDate must be on or before endDate" });
      return;
    }
    // Inclusive end: < endDate + 1 day
    const end = new Date(`${endDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    parts.push(lt(auditLogTable.createdAt, end));
  }

  const where = parts.length ? and(...parts) : sql`true`;

  const rows = await db
    .select()
    .from(auditLogTable)
    .where(where)
    .orderBy(desc(auditLogTable.createdAt))
    .limit(500);
  res.json(
    rows.map((r) => ({
      id: r.id,
      actorName: r.actorName,
      actorRole: r.actorRole,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      details: r.details,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
