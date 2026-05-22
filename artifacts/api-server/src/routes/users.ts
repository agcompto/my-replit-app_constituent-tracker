import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  ResetUserPasswordParams,
  DeleteUserParams,
  ResendInviteParams,
  ResetUserTotpParams,
} from "@workspace/api-zod";
import { requireRole, audit } from "../lib/auth";
import { isBootstrapSuperAdmin, isSamlManagedUser } from "../lib/samlAccount";
import { appSettingsTable } from "@workspace/db";
import { requireRecentAuth, RECENT_AUTH_WINDOW_MS } from "../lib/recentAuth";
import { deleteAllRecoveryCodes } from "../lib/totp";
import { generateTempPassword } from "../lib/password";
import { issueSetupToken } from "../lib/passwordSetupTokens";
import { buildSetupPasswordUrl } from "../lib/appUrl";
import { sendInviteEmail, sendResetEmail } from "../lib/email";

const router: IRouter = Router();

// Admin-issued invite/resend links are valid for 48h (onboarding flow).
// Password resets — whether self-service or admin-triggered — are valid for
// only 2h to keep the account-takeover window tight.
const INVITE_TTL_HOURS = 48;
const RESET_TTL_HOURS = 2;

router.get(
  "/users",
  requireRole("admin", "super_admin"),
  async (_req, res): Promise<void> => {
    const rows = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(
      rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        active: r.active,
        passwordLoginDisabled: r.passwordLoginDisabled,
        samlLinked: r.samlSubjectNameid != null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

/**
 * Build the standard "invite/reset" response envelope. The one-time setup
 * URL is always returned to the admin so they can hand-deliver it to the
 * user via a secure out-of-band channel as a fallback. When `RESEND_API_KEY`
 * + `EMAIL_FROM` are configured the same link is also emailed to the user
 * automatically; `emailed: true` lets the admin UI show "Email sent to
 * <user>" and treat the copy-link affordance as a backup channel. The token
 * in the URL is single-use, short-lived, and stored only as a SHA-256 hash
 * server-side.
 */
function inviteResponse(opts: {
  setupUrl: string;
  expiresAt: Date;
  emailed?: boolean;
}) {
  return {
    setupUrl: opts.setupUrl,
    expiresAt: opts.expiresAt.toISOString(),
    emailed: Boolean(opts.emailed),
  };
}

router.post(
  "/users",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { email, name, role } = parsed.data;
    if (role === "super_admin" && req.currentUser!.role !== "super_admin") {
      res.status(403).json({ error: "Only super admins can create super admins" });
      return;
    }

    // Set a random unguessable password so the account can never be logged
    // into until the user completes the setup-link flow. The password is not
    // returned anywhere.
    const placeholderHash = await bcrypt.hash(generateTempPassword(32), 10);

    let createdUser;
    try {
      const [u] = await db
        .insert(usersTable)
        .values({
          email: email.toLowerCase().trim(),
          name,
          role,
          passwordHash: placeholderHash,
          mustChangePassword: true,
        })
        .returning();
      createdUser = u;
    } catch {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const { rawToken, expiresAt } = await issueSetupToken({
      userId: createdUser.id,
      kind: "invite",
      createdByUserId: req.currentUser!.id,
      ttlHours: INVITE_TTL_HOURS,
    });
    const setupUrl = buildSetupPasswordUrl(rawToken);

    // Best-effort send the setup link directly to the new user. If the email
    // helper isn't configured, or Resend is down, we silently fall back to
    // the legacy out-of-band flow — the admin still receives `setupUrl` in
    // this response.
    const sendResult = await sendInviteEmail({
      to: createdUser.email,
      name: createdUser.name,
      setupUrl,
      expiresAt,
    });

    await audit({
      actor: req.currentUser!,
      action: "create_user",
      entityType: "user",
      entityId: createdUser.id,
      details: `Created ${createdUser.email} as ${createdUser.role}${sendResult.ok ? " (invite email sent)" : ""}`,
    });

    res.status(201).json({
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        active: createdUser.active,
        createdAt: createdUser.createdAt.toISOString(),
      },
      ...inviteResponse({ setupUrl, expiresAt, emailed: sendResult.ok }),
    });
  },
);

router.patch(
  "/users/:id",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = UpdateUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateUserBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (body.data.role === "super_admin" && req.currentUser!.role !== "super_admin") {
      res.status(403).json({ error: "Only super admins can grant super_admin" });
      return;
    }
    // Granting super_admin requires a fresh password authentication
    // (re-auth within the last 5 minutes). Other edits — name, active
    // flag, downgrades — go through unguarded. Email is not editable
    // via this route.
    if (body.data.role === "super_admin") {
      const last = req.session?.lastAuthAt;
      if (!last || Date.now() - last > RECENT_AUTH_WINDOW_MS) {
        res.status(403).json({
          error: "Please re-enter your password to confirm this action.",
          code: "reauth_required",
        });
        return;
      }
    }
    if (req.currentUser!.role !== "super_admin") {
      const [target] = await db
        .select({ role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, params.data.id));
      if (target?.role === "super_admin") {
        res.status(403).json({ error: "Admins cannot modify super_admin accounts" });
        return;
      }
    }
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.id));
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const patch = { ...body.data } as Record<string, unknown>;
    if (
      "passwordLoginDisabled" in patch &&
      isBootstrapSuperAdmin(targetUser)
    ) {
      res.status(400).json({
        error: "Password login cannot be disabled for the bootstrap super-admin.",
      });
      return;
    }
    const [settings] = await db
      .select({ samlGroupSyncEnabled: appSettingsTable.samlGroupSyncEnabled })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.id, 1))
      .limit(1);
    if (
      settings?.samlGroupSyncEnabled &&
      (await isSamlManagedUser(targetUser.id)) &&
      patch.role !== undefined &&
      patch.role !== targetUser.role
    ) {
      res.status(403).json({
        error: "Role is managed by Microsoft Entra group sync.",
      });
      return;
    }
    const [u] = await db
      .update(usersTable)
      .set(patch as typeof body.data)
      .where(eq(usersTable.id, params.data.id))
      .returning();
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await audit({
      actor: req.currentUser!,
      action: "update_user",
      entityType: "user",
      entityId: u.id,
      details: JSON.stringify(body.data),
    });
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      passwordLoginDisabled: u.passwordLoginDisabled,
      samlLinked: u.samlSubjectNameid != null,
      createdAt: u.createdAt.toISOString(),
    });
  },
);

router.post(
  "/users/:id/reset-password",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = ResetUserPasswordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (req.currentUser!.role !== "super_admin" && u.role === "super_admin") {
      res.status(403).json({ error: "Admins cannot reset passwords for super_admin accounts" });
      return;
    }

    const { rawToken, expiresAt } = await issueSetupToken({
      userId: u.id,
      kind: "reset",
      createdByUserId: req.currentUser!.id,
      ttlHours: RESET_TTL_HOURS,
    });
    const setupUrl = buildSetupPasswordUrl(rawToken);

    const sendResult = await sendResetEmail({
      to: u.email,
      name: u.name,
      setupUrl,
      expiresAt,
      source: "admin",
    });

    await audit({
      actor: req.currentUser!,
      action: "reset_password",
      entityType: "user",
      entityId: u.id,
      details: `Issued password-reset link${sendResult.ok ? " (emailed)" : ""}`,
    });

    res.json(inviteResponse({ setupUrl, expiresAt, emailed: sendResult.ok }));
  },
);

router.post(
  "/users/:id/resend-invite",
  requireRole("admin", "super_admin"),
  async (req, res): Promise<void> => {
    const params = ResendInviteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
    if (!u) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (req.currentUser!.role !== "super_admin" && u.role === "super_admin") {
      res.status(403).json({ error: "Admins cannot resend invites for super_admin accounts" });
      return;
    }
    // Resending always issues an invite-kind token. If the user has already
    // completed setup we still allow it — admins use this to re-onboard a
    // user who lost access.
    const { rawToken, expiresAt } = await issueSetupToken({
      userId: u.id,
      kind: "invite",
      createdByUserId: req.currentUser!.id,
      ttlHours: INVITE_TTL_HOURS,
    });
    const setupUrl = buildSetupPasswordUrl(rawToken);

    const sendResult = await sendInviteEmail({
      to: u.email,
      name: u.name,
      setupUrl,
      expiresAt,
    });

    await audit({
      actor: req.currentUser!,
      action: "resend_invite",
      entityType: "user",
      entityId: u.id,
      details: `Issued new setup link${sendResult.ok ? " (emailed)" : ""}`,
    });

    res.json(inviteResponse({ setupUrl, expiresAt, emailed: sendResult.ok }));
  },
);

router.delete(
  "/users/:id",
  requireRole("super_admin"),
  requireRecentAuth,
  async (req, res): Promise<void> => {
    const params = DeleteUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const targetId = params.data.id;
    if (targetId === req.currentUser!.id) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    // Refuse to delete the last remaining active super_admin.
    if (target.role === "super_admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.role, "super_admin"),
            eq(usersTable.active, true),
            ne(usersTable.id, targetId),
          ),
        );
      if ((count ?? 0) === 0) {
        res
          .status(400)
          .json({ error: "Cannot delete the last active super_admin." });
        return;
      }
    }

    // Audit BEFORE deletion so the FK to users (audit_log.actor_user_id) is
    // still satisfied for the actor; the entity row is being deleted, but the
    // actor is the current admin (different user).
    await audit({
      actor: req.currentUser!,
      action: "delete_user",
      entityType: "user",
      entityId: target.id,
      details: `Deleted ${target.email} (${target.role})`,
    });

    // Some FKs from other tables to users.id are nullable without ON DELETE
    // CASCADE (e.g. campaigns.submitted_by_user_id is NOT NULL). Detach those
    // by reassigning to the deleting super_admin so the historical record is
    // preserved without breaking integrity. Wrap the entire delete in a
    // transaction so a mid-flight failure can't leave dangling rows or
    // half-detached references.
    const actorId = req.currentUser!.id;
    await db.transaction(async (tx) => {
      // Reassign owned records to the acting super_admin (NOT NULL FKs).
      await tx.execute(sql`
        UPDATE campaigns SET submitted_by_user_id = ${actorId}
        WHERE submitted_by_user_id = ${targetId}
      `);
      await tx.execute(sql`
        UPDATE export_jobs SET exported_by_user_id = ${actorId}
        WHERE exported_by_user_id = ${targetId}
      `);
      await tx.execute(sql`
        UPDATE upload_jobs SET uploaded_by_user_id = ${actorId}
        WHERE uploaded_by_user_id = ${targetId}
      `);
      // Null out non-essential creator FKs.
      await tx.execute(sql`
        UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = ${targetId}
      `);
      await tx.execute(sql`
        UPDATE seed_groups SET created_by_user_id = NULL WHERE created_by_user_id = ${targetId}
      `);
      await tx.execute(sql`
        UPDATE suppressions SET created_by_user_id = NULL WHERE created_by_user_id = ${targetId}
      `);
      await tx.execute(sql`
        UPDATE campaign_health_checks SET created_by_user_id = NULL
        WHERE created_by_user_id = ${targetId}
      `);
      // password_setup_tokens.user_id has ON DELETE CASCADE so the user's own
      // tokens go away with them, but tokens *issued by* this admin against
      // other users (created_by_user_id) have no cascade — null them.
      await tx.execute(sql`
        UPDATE password_setup_tokens SET created_by_user_id = NULL
        WHERE created_by_user_id = ${targetId}
      `);

      await tx.delete(usersTable).where(eq(usersTable.id, targetId));
    });
    res.status(204).end();
  },
);

/**
 * Super-admin-only: clear another user's TOTP enrollment. The target user
 * is forced to re-enroll on their next login (when role still mandates
 * TOTP) or simply continues with password-only login (standard role).
 * Re-auth gated like other privileged actions.
 */
router.post(
  "/users/:id/totp/reset",
  requireRole("super_admin"),
  requireRecentAuth,
  async (req, res): Promise<void> => {
    const params = ResetUserTotpParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const targetId = params.data.id;
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, targetId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db
      .update(usersTable)
      .set({ totpSecretEncrypted: null, totpEnrolledAt: null })
      .where(eq(usersTable.id, targetId));
    await deleteAllRecoveryCodes(targetId);
    await audit({
      actor: req.currentUser!,
      action: "totp_reset",
      entityType: "user",
      entityId: targetId,
      details: `Cleared TOTP enrollment for ${target.email}`,
    });
    res.status(204).end();
  },
);

export default router;
