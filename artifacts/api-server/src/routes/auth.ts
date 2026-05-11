import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  LoginBody,
  ChangeOwnPasswordBody,
  ForgotPasswordBody,
} from "@workspace/api-zod";
import { loadUser, requireAuth, audit } from "../lib/auth";
import {
  checkLoginRate,
  recordLoginFailure,
  recordLoginSuccess,
  checkChangePasswordRate,
  recordChangePasswordFailure,
  recordChangePasswordSuccess,
  checkForgotPasswordPerIp,
} from "../lib/rateLimit";
import { SESSION_TTL_MS } from "../lib/session";
import {
  getLockoutState,
  recordLoginFailureForUser,
  clearLoginFailures,
} from "../lib/lockout";
import { validatePasswordPolicy } from "../lib/passwordPolicy";
import { issueSetupToken } from "../lib/passwordSetupTokens";
import { sendPasswordSetupLink, isEmailConfigured } from "../lib/email";
import { buildSetupPasswordUrl } from "../lib/appUrl";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FORGOT_PASSWORD_TTL_HOURS = 2;

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

/**
 * "Forgot password" entry point. Always returns 204 — never reveals whether
 * the email exists or whether a token was issued, to avoid an account
 * enumeration oracle. Rate-limited per (email, ip) by reusing the login
 * bucket.
 */
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(204).end();
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.ip ?? "unknown";

  // Per-IP cap layered on top of the per-(email,ip) bucket. Stops one IP
  // from fanning out across many emails to enumerate accounts or run up
  // the email-provider bill. We still respond 204 either way — never
  // reveal whether a request was throttled vs accepted.
  const ipRate = checkForgotPasswordPerIp(ip);
  if (!ipRate.allowed) {
    res.status(204).end();
    return;
  }

  const rateKey = `forgot|${email}|${ip}`;
  const rate = checkLoginRate(rateKey);
  if (!rate.allowed) {
    res.status(204).end();
    return;
  }
  // Always count the attempt against the bucket so attackers can't fish
  // freely.
  recordLoginFailure(rateKey);

  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (u && u.active) {
    try {
      const { rawToken } = await issueSetupToken({
        userId: u.id,
        kind: "reset",
        ttlHours: FORGOT_PASSWORD_TTL_HOURS,
      });
      const setupUrl = buildSetupPasswordUrl(rawToken);
      if (isEmailConfigured()) {
        await sendPasswordSetupLink({
          to: u.email,
          recipientName: u.name,
          url: setupUrl,
          kind: "reset",
          expiresInHours: FORGOT_PASSWORD_TTL_HOURS,
        });
      }
    } catch (err) {
      logger.warn({ errName: (err as Error).name }, "forgot-password issue/email failed");
    }
  }

  res.status(204).end();
});

export default router;
