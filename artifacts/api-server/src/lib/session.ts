import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
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

declare module "express-session" {
  interface SessionData {
    userId?: number;
    /** Unix-ms of the last successful password authentication for this session.
     *  Used by `requireRecentAuth` to gate destructive/privileged operations. */
    lastAuthAt?: number;
  }
}
