import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import type { RequestHandler } from "express";

const PgStore = connectPgSimple(session);

const secret = process.env.SESSION_SECRET;
if (!secret) {
  throw new Error("SESSION_SECRET must be set");
}

export const SESSION_TTL_MS = {
  default: 1000 * 60 * 60 * 12, // 12h
  super_admin: 1000 * 60 * 60 * 4, // 4h
} as const;

export const sessionMiddleware: RequestHandler = session({
  store: new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: false,
    // Sweep expired session rows once an hour. Without this the `session`
    // table grows unbounded — every login adds a row that connect-pg-simple
    // never reaps automatically.
    pruneSessionInterval: 60 * 60,
  }),
  secret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    // Default TTL applied to anonymous and standard/admin sessions. The
    // per-role override for super_admin is enforced on every request by
    // `applyRoleSessionTtl` (see app.ts), because express-session with
    // `rolling: true` would otherwise reset the cookie back to this value
    // on each response and silently re-extend a 4h super_admin session
    // to 12h.
    maxAge: SESSION_TTL_MS.default,
  },
  name: "ctp.sid",
});

/** Per-request middleware that enforces the per-role session TTL on every
 *  rolling response. Must run AFTER `attachUser` so `req.currentUser` is
 *  populated. */
export const applyRoleSessionTtl: RequestHandler = (req, _res, next) => {
  if (req.session && req.currentUser) {
    req.session.cookie.maxAge =
      req.currentUser.role === "super_admin"
        ? SESSION_TTL_MS.super_admin
        : SESSION_TTL_MS.default;
  }
  next();
};

/**
 * Delete every server-side session row for the given user EXCEPT the one
 * identified by `keepSid` (typically the caller's current session). Used
 * after a password change/setup so that any previously stolen session
 * cookie stops working immediately, instead of surviving until its TTL
 * expires.
 *
 * `connect-pg-simple` stores the session payload as JSONB in `session.sess`,
 * so we filter on `sess->>'userId'`. The session id column is `sid`.
 */
export async function revokeOtherSessionsForUser(
  userId: number,
  keepSid: string | null | undefined,
): Promise<void> {
  if (keepSid) {
    await db.execute(sql`
      DELETE FROM session
      WHERE (sess->>'userId')::int = ${userId}
        AND sid <> ${keepSid}
    `);
  } else {
    await db.execute(sql`
      DELETE FROM session
      WHERE (sess->>'userId')::int = ${userId}
    `);
  }
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
    /** Unix-ms of the last successful password authentication for this session.
     *  Used by `requireRecentAuth` to gate destructive/privileged operations. */
    lastAuthAt?: number;
    /** Set after the password step of login when a second TOTP factor is
     *  required. The session is NOT yet authenticated (`userId` is unset)
     *  until the TOTP step completes. */
    pendingTotpUserId?: number;
    /** Unix-ms when the pending-TOTP state was created. Used to expire the
     *  half-completed login if the user walks away from the second step. */
    pendingTotpStartedAt?: number;
    /** Encrypted candidate TOTP secret produced by `/auth/totp/enroll/start`.
     *  Only persisted to the user row after the user proves possession by
     *  completing `/auth/totp/enroll/verify` with a valid code. */
    pendingTotpSecret?: string;
    /** How the current session authenticated. */
    authMethod?: "password" | "saml";
    /** SAML AuthnRequest ID for InResponseTo validation. */
    samlAuthnRequestId?: string;
    /** Validated relative return path for post-ACS redirect. */
    samlReturnTo?: string;
  }
}
