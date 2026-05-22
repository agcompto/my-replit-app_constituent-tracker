import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, appSettingsTable } from "@workspace/db";
import { loadUser, audit, type Role } from "./auth";
import { generateTempPassword } from "./password";

export type SamlRoleGroupMap = {
  super_admin: string[];
  admin: string[];
  standard: string[];
};

export type ResolvedSamlAccount =
  | { ok: true; userId: number; jitProvisioned: boolean; roleSynced: boolean; newRole?: Role }
  | { ok: false; reason: "domain_not_allowed" | "account_disabled" };

export function bootstrapAdminEmail(): string {
  return (process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@example.com").toLowerCase().trim();
}

export function isBootstrapSuperAdmin(user: { email: string; role: string }): boolean {
  return user.role === "super_admin" && user.email.toLowerCase().trim() === bootstrapAdminEmail();
}

function emailDomainAllowed(email: string, domains: string[]): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return domains.some((d) => d.toLowerCase().trim() === domain);
}

function roleFromGroups(
  groupIds: string[],
  map: SamlRoleGroupMap,
): Role {
  const norm = new Set(groupIds.map((g) => g.toLowerCase()));
  const has = (ids: string[]) => ids.some((id) => norm.has(id.toLowerCase()));
  if (has(map.super_admin)) return "super_admin";
  if (has(map.admin)) return "admin";
  return "standard";
}

export function extractGroupIdsFromProfile(profile: Record<string, unknown>): string[] {
  const keys = [
    "groups",
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
    "http://schemas.xmlsoap.org/claims/Group",
  ];
  const out: string[] = [];
  for (const key of keys) {
    const v = profile[key];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(item);
      }
    } else if (typeof v === "string") {
      out.push(v);
    }
  }
  return out;
}

export function normalizeSamlEmail(profile: Record<string, unknown>): string | null {
  const raw =
    (typeof profile.email === "string" && profile.email) ||
    (typeof profile.mail === "string" && profile.mail) ||
    (typeof profile["urn:oid:0.9.2342.19200300.100.1.3"] === "string" &&
      profile["urn:oid:0.9.2342.19200300.100.1.3"]) ||
    null;
  if (!raw) return null;
  return raw.toLowerCase().trim();
}

export function displayNameFromProfile(profile: Record<string, unknown>, email: string): string {
  const given =
    (typeof profile.givenname === "string" && profile.givenname) ||
    (typeof profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"] ===
      "string" &&
      profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"]) ||
    "";
  const family =
    (typeof profile.surname === "string" && profile.surname) ||
    (typeof profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"] ===
      "string" &&
      profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"]) ||
    "";
  const display =
    (typeof profile.displayname === "string" && profile.displayname) ||
    (typeof profile.name === "string" && profile.name) ||
    "";
  const combined = [given, family].filter(Boolean).join(" ").trim();
  return combined || display.trim() || email.split("@")[0];
}

async function loadAppSamlSettings() {
  const [s] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.id, 1)).limit(1);
  return s;
}

export async function resolveSamlAccount(opts: {
  nameId: string;
  profile: Record<string, unknown>;
}): Promise<ResolvedSamlAccount> {
  const settings = await loadAppSamlSettings();
  const jitDomains = settings?.samlJitEmailDomains ?? [];
  const groupMap = (settings?.samlRoleGroupMap ?? {
    super_admin: [],
    admin: [],
    standard: [],
  }) as SamlRoleGroupMap;
  const syncEnabled = Boolean(settings?.samlGroupSyncEnabled);

  const email = normalizeSamlEmail(opts.profile);
  if (!email) return { ok: false, reason: "domain_not_allowed" };

  const groupIds = extractGroupIdsFromProfile(opts.profile);
  const syncedRole = roleFromGroups(groupIds, groupMap);

  let existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.samlSubjectNameid, opts.nameId))
    .limit(1);
  if (existing.length === 0) {
    existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  }

  if (existing.length > 0) {
    const u = existing[0];
    if (!u.active) {
      return { ok: false, reason: "account_disabled" };
    }
    const updates: Partial<typeof usersTable.$inferInsert> = {
      samlLastLoginAt: new Date(),
    };
    if (!u.samlSubjectNameid) updates.samlSubjectNameid = opts.nameId;
    let roleSynced = false;
    if (syncEnabled && u.role !== syncedRole && !isBootstrapSuperAdmin(u)) {
      updates.role = syncedRole;
      roleSynced = true;
    }
    await db.update(usersTable).set(updates).where(eq(usersTable.id, u.id));
    if (roleSynced) {
      const actor = await loadUser(u.id);
      if (actor) {
        await audit({
          actor,
          action: "saml_role_synced",
          entityType: "user",
          entityId: u.id,
          details: JSON.stringify({ role: syncedRole }),
        });
      }
    }
    return { ok: true, userId: u.id, jitProvisioned: false, roleSynced };
  }

  if (!emailDomainAllowed(email, jitDomains)) {
    return { ok: false, reason: "domain_not_allowed" };
  }

  const placeholderHash = await bcrypt.hash(generateTempPassword(32), 10);
  const name = displayNameFromProfile(opts.profile, email);
  const role = syncEnabled ? syncedRole : "standard";
  const [created] = await db
    .insert(usersTable)
    .values({
      email,
      name,
      role,
      passwordHash: placeholderHash,
      mustChangePassword: false,
      passwordLoginDisabled: true,
      samlSubjectNameid: opts.nameId,
      samlLastLoginAt: new Date(),
    })
    .returning();

  const actor = await loadUser(created.id);
  if (actor) {
    await audit({
      actor,
      action: "saml_jit_provisioned",
      entityType: "user",
      entityId: created.id,
      details: JSON.stringify({ email, role }),
    });
  }
  return { ok: true, userId: created.id, jitProvisioned: true, roleSynced: syncEnabled, newRole: role };
}

export async function isSamlManagedUser(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ samlSubjectNameid: usersTable.samlSubjectNameid })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return Boolean(u?.samlSubjectNameid);
}
