import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  LoginBody,
  ChangeOwnPasswordBody,
  ReauthBody,
  ForgotPasswordBody,
} from "@workspace/api-zod";
import { loadUser, requireAuth, audit } from "../lib/auth";
import { revokeOtherSessionsForUser } from "../lib/session";
import {
  checkLoginRate,
  recordLoginFailure,
  recordLoginSuccess,
  checkChangePasswordRate,
  recordChangePasswordFailure,
  recordChangePasswordSuccess,
  checkForgotPasswordPerIp,
} from "../lib/rateLimit";
import { issueSetupToken } from "../lib/passwordSetupTokens";
import { buildSetupPasswordUrl } from "../lib/appUrl";
import { sendResetEmail } from "../lib/email";
import { SESSION_TTL_MS } from "../lib/session";
import {
  getLockoutState,
  recordLoginFailureForUser,
  clearLoginFailures,
} from "../lib/lockout";
import { validatePasswordPolicy } from "../lib/passwordPolicy";

const router: IRouter = Router();

// Constant bcrypt hash used to equalize timing on the no-such-user / inactive
// login path so the response time can't be used to enumerate valid emails.
// The plaintext is irrelevant — it's never compared for a match, only used
// to consume roughly the same amount of CPU as a real bcrypt.compare. Cost
// must match the cost used by bcrypt.hash() elsewhere in this file (10).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  "this-is-not-a-real-password-and-will-never-match",
  10,
);

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ip = req.ip ?? "unknown";
  const rateKey = `${normalizedEmail}|${ip}`;

  const limit = checkLoginRate(rateKey);
  if (!limit.allowed) {
    res
      .status(429)
      .setHeader("Retry-After", String(limit.retryAfterSec))
      .json({
        error: `Too many failed login attempts. Try again in ${Math.ceil(
          limit.retryAfterSec / 60,
        )} minutes.`,
      });
    return;
  }

  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  const sendAuthFailure = (r: { allowed: boolean; retryAfterSec: number }) => {
    if (!r.allowed) {
      res
        .status(429)
        .setHeader("Retry-After", String(r.retryAfterSec))
        .json({
          error: `Too many failed login attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} minutes.`,
        });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  };

  if (!u || !u.active) {
    // Run a dummy bcrypt.compare so the response time on this path is
    // indistinguishable from the path where the user exists and the
    // supplied password is wrong. Without this, an attacker can probe
    // for valid emails by measuring response latency.
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    sendAuthFailure(recordLoginFailure(rateKey));
    return;
  }

  // Persisted account lockout (independent of IP rotation).
  const lock = await getLockoutState(u.id);
  if (lock.locked) {
    res
      .status(429)
      .setHeader("Retry-After", String(lock.retryAfterSec))
      .json({
        error: `This account is temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minutes.`,
      });
    return;
  }

  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    const accountLock = await recordLoginFailureForUser(u.id);
    if (accountLock.locked) {
      res
        .status(429)
        .setHeader("Retry-After", String(accountLock.retryAfterSec))
        .json({
          error: `This account is temporarily locked due to too many failed login attempts. Try again in ${Math.ceil(accountLock.retryAfterSec / 60)} minutes.`,
        });
      return;
    }
    sendAuthFailure(recordLoginFailure(rateKey));
    return;
  }

  recordLoginSuccess(rateKey);
  await clearLoginFailures(u.id);
  const sessionUser = await loadUser(u.id);
  if (!sessionUser) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Regenerate the session ID across the unauth → auth boundary to defeat
  // session fixation. Then write the new userId/lastAuthAt and apply the
  // per-role TTL.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  req.session.userId = u.id;
  req.session.lastAuthAt = Date.now();
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
    action: "login",
    entityType: "user",
    entityId: u.id,
  });
  res.json(sessionUser);
});

/**
 * Re-authentication endpoint. Used by the frontend when the server returns
 * `code: "reauth_required"` on a destructive/privileged operation. Verifies
 * the caller's password against their CURRENT account (no email parameter —
 * we only re-auth the already-logged-in user) and on success bumps
 * `req.session.lastAuthAt` so the gated request can be retried.
 *
 * Failures are subject to the same per-user lockout as `/auth/login` so an
 * attacker with a stolen session cookie can't grind passwords here without
 * tripping the lockout.
 */
router.post(
  "/auth/reauth",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ReauthBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.currentUser!.id;
    const lock = await getLockoutState(userId);
    if (lock.locked) {
      res
        .status(429)
        .setHeader("Retry-After", String(lock.retryAfterSec))
        .json({
          error: `This account is temporarily locked. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minutes.`,
        });
      return;
    }
    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u || !u.active) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const ok = await bcrypt.compare(parsed.data.password, u.passwordHash);
    if (!ok) {
      const accountLock = await recordLoginFailureForUser(userId);
      if (accountLock.locked) {
        res
          .status(429)
          .setHeader("Retry-After", String(accountLock.retryAfterSec))
          .json({
            error: `This account is temporarily locked. Try again in ${Math.ceil(accountLock.retryAfterSec / 60)} minutes.`,
          });
        return;
      }
      res.status(401).json({ error: "Incorrect password." });
      return;
    }
    await clearLoginFailures(userId);
    req.session.lastAuthAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });
    res.status(204).end();
  },
);

/**
 * Self-service "forgot password" endpoint.
 *
 * Security model:
 *  - Always responds 200 with the same generic body, regardless of whether
 *    the submitted email matches an account. This is the long-standing
 *    defence against account-existence enumeration.
 *  - If a real, active account matches, we issue a short-lived (2h)
 *    single-use reset token and email the link via Resend. Issuing a new
 *    reset token revokes any prior live one (`issueSetupToken`).
 *  - Pre-auth IP rate-limited (5 / 15 min) to prevent mailbomb abuse.
 *  - Timing parity: every code path (rate-limited, malformed body, no-such-
 *    user, inactive user, real match with token issue + Resend call, real
 *    match with thrown error) is held to a constant floor response time of
 *    ~FORGOT_PASSWORD_FLOOR_MS plus small jitter, scheduled before any
 *    branching work so the matched/unmatched latency distribution is
 *    indistinguishable from the client's perspective even with statistical
 *    timing analysis. Combined with the per-IP rate limit and the constant
 *    200 response body, this closes the timing oracle that would otherwise
 *    let an attacker enumerate accounts.
 *  - The audit log entry references the matched user (or is omitted if no
 *    match) so the audit feed doesn't accumulate one row per bot probe.
 */
const FORGOT_PASSWORD_FLOOR_MS = 750;
const FORGOT_PASSWORD_JITTER_MS = 150;
const GENERIC_FORGOT_BODY = {
  message:
    "If an account exists for that email, a password reset link has been sent.",
};

router.post("/auth/forgot-password", (req, res): void => {
  // Decouple work from the HTTP response. The response is *only* gated on
  // a fixed floor + small jitter so its latency is independent of any
  // matched-branch work (DB insert, outbound Resend round-trip, audit
  // write). Without this decoupling, an attacker could measure whether
  // Resend was called by observing whether matched requests run longer
  // than the floor — turning the latency itself into an enumeration
  // oracle, especially when the upstream provider is slow or rate-limiting
  // us. The matched-branch promise runs in the background; its rejections
  // are swallowed (logged) and never reach the client.
  const jitter = Math.floor(Math.random() * FORGOT_PASSWORD_JITTER_MS);
  setTimeout(() => {
    res.status(200).json(GENERIC_FORGOT_BODY);
  }, FORGOT_PASSWORD_FLOOR_MS + jitter);

  const ip = req.ip ?? "unknown";
  const limit = checkForgotPasswordPerIp(ip);
  if (!limit.allowed) return;

  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) return;
  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // Background work — never awaited from the response path.
  void (async () => {
    try {
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail));
      if (!u || !u.active) return;

      const { rawToken, expiresAt } = await issueSetupToken({
        userId: u.id,
        kind: "reset",
        createdByUserId: null,
        ttlHours: 2,
      });
      const setupUrl = buildSetupPasswordUrl(rawToken);
      const sendResult = await sendResetEmail({
        to: u.email,
        name: u.name,
        setupUrl,
        expiresAt,
        source: "self_service",
      });
      const sessionUser = await loadUser(u.id);
      if (sessionUser) {
        await audit({
          actor: sessionUser,
          action: "self_service_password_reset_requested",
          entityType: "user",
          entityId: u.id,
          details: sendResult.ok
            ? "Self-service reset link emailed"
            : "Self-service reset link issued (email send failed; user must contact admin)",
        });
      }
    } catch (err) {
      req.log.warn(
        { errName: (err as Error).name },
        "forgot-password: failed to issue/send reset for matched user",
      );
    }
  })();
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("ctp.sid");
    res.status(204).end();
  });
});

router.get("/auth/me", requireAuth, (req, res): void => {
  res.json(req.currentUser);
});

router.post("/auth/acknowledge-pii", requireAuth, async (req, res): Promise<void> => {
  await db
    .update(usersTable)
    .set({ piiAcknowledgedAt: new Date() })
    .where(eq(usersTable.id, req.currentUser!.id));
  const u = await loadUser(req.currentUser!.id);
  await audit({
    actor: req.currentUser!,
    action: "acknowledge_pii",
    entityType: "user",
    entityId: req.currentUser!.id,
  });
  res.json(u);
});

router.post(
  "/auth/change-password",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangeOwnPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { currentPassword, newPassword } = parsed.data;
    if (currentPassword === newPassword) {
      res.status(400).json({ error: "New password must be different from current password." });
      return;
    }
    const userId = req.currentUser!.id;
    const ip = req.ip ?? "unknown";

    const limit = checkChangePasswordRate(userId, ip);
    if (!limit.allowed) {
      res
        .status(429)
        .setHeader("Retry-After", String(limit.retryAfterSec))
        .json({
          error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
        });
      return;
    }

    const [u] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const ok = await bcrypt.compare(currentPassword, u.passwordHash);
    if (!ok) {
      const r = recordChangePasswordFailure(userId, ip);
      if (!r.allowed) {
        res
          .status(429)
          .setHeader("Retry-After", String(r.retryAfterSec))
          .json({
            error: `Too many attempts. Try again in ${Math.ceil(r.retryAfterSec / 60)} minutes.`,
          });
      } else {
        res.status(401).json({ error: "Current password is incorrect." });
      }
      return;
    }
    recordChangePasswordSuccess(userId, ip);

    const policy = await validatePasswordPolicy({
      password: newPassword,
      email: u.email,
      name: u.name,
    });
    if (!policy.ok) {
      res.status(400).json({ error: policy.reason });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(usersTable.id, userId));
    await clearLoginFailures(userId);
    // Successful password change re-authenticates the user — bump the
    // freshness timestamp so they don't get re-prompted immediately when
    // performing a sensitive operation right after.
    req.session.lastAuthAt = Date.now();
    // Kill every OTHER active session for this user so that a stolen
    // session cookie stops working as soon as the legitimate owner
    // changes their password. The current session is preserved so the
    // user isn't logged out of the tab they just used.
    try {
      await revokeOtherSessionsForUser(userId, req.sessionID);
    } catch (err) {
      req.log.warn(
        { errName: (err as Error).name },
        "failed to revoke other sessions after change-password",
      );
    }
    await audit({
      actor: req.currentUser!,
      action: "change_own_password",
      entityType: "user",
      entityId: userId,
    });
    const updated = await loadUser(userId);
    res.json(updated);
  },
);

export default router;
