import type { Request, Response, NextFunction } from "express";

/** Maximum age of a successful password authentication that still counts as
 *  "recent" for the purposes of destructive/privileged operations. */
export const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000;

/** Express middleware that requires the caller to have re-authenticated
 *  (logged in or changed/set their password) within the last
 *  `RECENT_AUTH_WINDOW_MS`. Returns 403 with code "reauth_required" otherwise.
 *
 *  This is layered ON TOP OF `requireAuth` / `requireRole`, never replacing
 *  them. Use it on operations whose blast radius justifies a fresh password
 *  prompt: granting super_admin, deleting users, deleting campaigns, etc. */
export function requireRecentAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const last = req.session?.lastAuthAt;
  if (!last || Date.now() - last > RECENT_AUTH_WINDOW_MS) {
    res.status(403).json({
      error:
        "Please re-enter your password to confirm this action.",
      code: "reauth_required",
    });
    return;
  }
  next();
}
