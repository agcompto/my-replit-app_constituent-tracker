import type { Request, Response } from "express";
import { audit, type SessionUser } from "./auth";
import { SESSION_TTL_MS } from "./session";

export type AuthMethod = "password" | "saml";

/**
 * Shared finalize-login routine. Regenerates the session id, writes
 * `userId`/`lastAuthAt`/`authMethod`, applies the per-role TTL, audits.
 */
export async function completeLogin(
  req: Request,
  res: Response,
  sessionUser: SessionUser,
  opts?: {
    auditAction?: string;
    auditDetails?: string | null;
    authMethod?: AuthMethod;
    redirectTo?: string;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = sessionUser.id;
  req.session.lastAuthAt = Date.now();
  req.session.authMethod = opts?.authMethod ?? "password";
  delete req.session.pendingTotpUserId;
  delete req.session.pendingTotpStartedAt;
  delete req.session.pendingTotpSecret;
  delete req.session.samlAuthnRequestId;
  delete req.session.samlReturnTo;

  const ttl =
    sessionUser.role === "super_admin"
      ? SESSION_TTL_MS.super_admin
      : SESSION_TTL_MS.default;
  req.session.cookie.maxAge = ttl;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
  await audit({
    actor: sessionUser,
    action: opts?.auditAction ?? "login",
    entityType: "user",
    entityId: sessionUser.id,
    details: opts?.auditDetails ?? null,
  });

  if (opts?.redirectTo) {
    res.redirect(302, opts.redirectTo);
    return;
  }
  res.json(sessionUser);
}
