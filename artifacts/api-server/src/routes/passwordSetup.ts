import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, usersTable, auditLogTable, passwordSetupTokensTable } from "@workspace/db";
import { ValidatePasswordSetupTokenParams, CompletePasswordSetupParams, CompletePasswordSetupBody } from "@workspace/api-zod";
import { validateSetupToken } from "../lib/passwordSetupTokens";
import { validatePasswordPolicy } from "../lib/passwordPolicy";

const router: IRouter = Router();

router.get(
  "/password-setup/:token",
  async (req, res): Promise<void> => {
    const params = ValidatePasswordSetupTokenParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const t = await validateSetupToken(params.data.token);
    if (!t) {
      res.status(404).json({ error: "This link is invalid or has expired." });
      return;
    }
    res.json({
      email: t.email,
      name: t.name,
      kind: t.kind,
      expiresAt: t.expiresAt.toISOString(),
    });
  },
);

router.post(
  "/password-setup/:token/complete",
  async (req, res): Promise<void> => {
    const params = CompletePasswordSetupParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const body = CompletePasswordSetupBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const t = await validateSetupToken(params.data.token);
    if (!t) {
      res.status(404).json({ error: "This link is invalid or has expired." });
      return;
    }

    const policy = await validatePasswordPolicy({
      password: body.data.newPassword,
      email: t.email,
      name: t.name,
    });
    if (!policy.ok) {
      res.status(400).json({ error: policy.reason });
      return;
    }

    // Hash before opening the transaction so the bcrypt CPU work doesn't hold
    // a DB connection. The token isn't consumed yet, so a crash here is safe.
    const passwordHash = await bcrypt.hash(body.data.newPassword, 10);

    // Atomically: consume the token (race-safe single update), set the new
    // password, clear lockout state, and write the audit row. If anything
    // fails the transaction rolls back so the single-use token isn't burned
    // without the password actually changing.
    const ok = await db.transaction(async (tx) => {
      const consumed = await tx
        .update(passwordSetupTokensTable)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(passwordSetupTokensTable.id, t.tokenId),
            isNull(passwordSetupTokensTable.usedAt),
          ),
        )
        .returning({ id: passwordSetupTokensTable.id });
      if (consumed.length !== 1) return false;

      await tx
        .update(usersTable)
        .set({
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(usersTable.id, t.userId));

      await tx.insert(auditLogTable).values({
        actorUserId: t.userId,
        actorName: t.name,
        actorRole: "user",
        action: t.kind === "invite" ? "complete_invite" : "complete_password_reset",
        entityType: "user",
        entityId: t.userId,
      });
      return true;
    });

    if (!ok) {
      res.status(404).json({ error: "This link is invalid or has expired." });
      return;
    }

    res.status(204).end();
  },
);

export default router;
