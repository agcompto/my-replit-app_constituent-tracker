import { db, usersTable, auditLogTable, campaignsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction, RequestHandler } from "express";

export type Role = "standard" | "admin" | "super_admin";

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  piiAcknowledged: boolean;
  mustChangePassword: boolean;
  /** True when the user has a confirmed TOTP secret on file. */
  totpEnrolled: boolean;
  /** True when the user's role mandates TOTP (admin/super_admin). */
  totpRequired: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      currentUser?: SessionUser;
    }
  }
}

export async function loadUser(userId: number): Promise<SessionUser | null> {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u || !u.active) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    active: u.active,
    piiAcknowledged: u.piiAcknowledgedAt != null,
    mustChangePassword: u.mustChangePassword,
    totpEnrolled: u.totpSecretEncrypted != null && u.totpEnrolledAt != null,
    totpRequired: u.role === "admin" || u.role === "super_admin",
  };
}

export const attachUser: RequestHandler = async (req, _res, next) => {
  const uid = req.session?.userId;
  if (uid) {
    const u = await loadUser(uid);
    if (u) req.currentUser = u;
  }
  next();
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.currentUser.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

export async function canMutateCampaign(
  campaignId: number,
  user: SessionUser,
): Promise<"allowed" | "forbidden" | "not_found" | "voided"> {
  const [c] = await db
    .select({
      submittedByUserId: campaignsTable.submittedByUserId,
      status: campaignsTable.status,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  if (!c) return "not_found";
  if (c.status === "voided") return "voided";
  if (user.role === "admin" || user.role === "super_admin") return "allowed";
  return c.submittedByUserId === user.id ? "allowed" : "forbidden";
}

export async function audit(opts: {
  actor: SessionUser;
  action: string;
  entityType: string;
  entityId?: number | null;
  details?: string | null;
  /** Optional Drizzle transaction handle so audit writes can be committed
   * atomically with the action they describe. Defaults to the global db. */
  tx?: { insert: typeof db.insert };
}): Promise<void> {
  const exec = opts.tx ?? db;
  await exec.insert(auditLogTable).values({
    actorUserId: opts.actor.id,
    actorName: opts.actor.name,
    actorRole: opts.actor.role,
    action: opts.action,
    entityType: opts.entityType,
    entityId: opts.entityId ?? null,
    details: opts.details ?? null,
  });
}
