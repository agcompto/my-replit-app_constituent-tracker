import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, ChangeOwnPasswordBody } from "@workspace/api-zod";
import { loadUser, requireAuth, audit } from "../lib/auth";
import {
  checkLoginRate,
  recordLoginFailure,
  recordLoginSuccess,
  checkChangePasswordRate,
  recordChangePasswordFailure,
  recordChangePasswordSuccess,
} from "../lib/rateLimit";

const router: IRouter = Router();

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
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    sendAuthFailure(recordLoginFailure(rateKey));
    return;
  }
  recordLoginSuccess(rateKey);
  req.session.userId = u.id;
  const session = await loadUser(u.id);
  if (!session) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  await audit({
    actor: session,
    action: "login",
    entityType: "user",
    entityId: u.id,
  });
  res.json(session);
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
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(usersTable.id, userId));
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
