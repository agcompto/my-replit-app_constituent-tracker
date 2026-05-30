import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

/**
 * POST /admin/reset-password
 *
 * Resets a user's password directly in the database. Hashes the supplied
 * password with bcrypt, clears any lockout state, and marks the account so
 * the user must change their password on next login.
 *
 * Body: { email: string, password: string }
 */
router.post("/admin/reset-password", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (typeof email !== "string" || !email) {
    res.status(400).json({ error: "email is required and must be a string" });
    return;
  }
  if (typeof password !== "string" || !password) {
    res.status(400).json({ error: "password is required and must be a string" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [updated] = await db
    .update(usersTable)
    .set({
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      updatedAt: sql`NOW()`,
    })
    .where(sql`lower(${usersTable.email}) = lower(${email})`)
    .returning();

  if (!updated) {
    res.status(404).json({ error: "No user found with that email address" });
    return;
  }

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
