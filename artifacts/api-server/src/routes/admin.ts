import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireRole, audit } from "../lib/auth";
import { requireRecentAuth } from "../lib/recentAuth";
import { checkAdminResetPasswordRate } from "../lib/rateLimit";

const router: IRouter = Router();

// Simple but RFC-5322-aligned email format check. Rejects obviously malformed
// addresses without pulling in a full validation library.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password strength requirements:
//   - 8–128 characters
//   - at least one uppercase letter
//   - at least one lowercase letter
//   - at least one digit
//   - at least one special character
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_UPPERCASE_RE = /[A-Z]/;
const PASSWORD_LOWERCASE_RE = /[a-z]/;
const PASSWORD_DIGIT_RE = /[0-9]/;
const PASSWORD_SPECIAL_RE = /[^A-Za-z0-9]/;

function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, number, and special character`;
  }
  if (
    !PASSWORD_UPPERCASE_RE.test(password) ||
    !PASSWORD_LOWERCASE_RE.test(password) ||
    !PASSWORD_DIGIT_RE.test(password) ||
    !PASSWORD_SPECIAL_RE.test(password)
  ) {
    return "Password must be at least 8 characters with uppercase, lowercase, number, and special character";
  }
  return null;
}

/**
 * POST /admin/reset-password
 *
 * Resets a user's password directly in the database. Hashes the supplied
 * password with bcrypt, clears any lockout state, and marks the account so
 * the user must change their password on next login.
 *
 * Body: { email: string, password: string }
 *
 * Security controls:
 *  - Rate limited to 5 requests per 15 minutes per IP address
 *  - Email format validated before any DB work
 *  - Password strength enforced (8+ chars, upper, lower, digit, special)
 *  - No sensitive data (passwords, hashes, full user records) in logs
 */
router.post("/admin/reset-password", requireRole("super_admin"), requireRecentAuth, async (req, res): Promise<void> => {
  // ── Rate limiting ────────────────────────────────────────────────────────
  const ip = req.ip ?? "unknown";
  const limit = checkAdminResetPasswordRate(ip);
  if (!limit.allowed) {
    res
      .status(429)
      .setHeader("Retry-After", String(limit.retryAfterSec))
      .json({
        error: `Too many requests. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`,
      });
    return;
  }

  // ── Input validation ─────────────────────────────────────────────────────
  const { email, password } = req.body;

  if (typeof email !== "string" || !email.trim()) {
    res.status(400).json({ error: "email is required and must be a string" });
    return;
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    res.status(400).json({ error: "email must be a valid email address" });
    return;
  }

  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "password is required and must be a string" });
    return;
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  // ── Database update ──────────────────────────────────────────────────────
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
      updatedAt: sql`NOW()`,
    })
    .where(sql`lower(${usersTable.email}) = lower(${normalizedEmail})`)
    .returning();

  if (!updated) {
    res.status(404).json({ error: "No user found with that email address" });
    return;
  }

  await audit({
    actor: req.currentUser!,
    action: "admin_reset_password",
    entityType: "user",
    entityId: updated.id,
  });

  logger.info({ userId: updated.id }, "Password reset initiated for user ID");

  res.json({
    success: true,
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

export default router;
