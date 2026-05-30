export type UserRole = "super_admin" | "admin" | "manager" | "planner" | string | undefined | null;

/**
 * Centralized frontend permission helpers.
 *
 * These helpers keep role checks out of page/layout components so Phase 2 can
 * evolve navigation, workflow permissions, and role naming without scattering
 * string comparisons across the UI. Server-side authorization remains the
 * source of truth; these helpers only control client-side visibility and UX.
 */
export function isAdministrator(role: UserRole): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === "super_admin";
}

export function canViewAuditLog(role: UserRole): boolean {
  return isAdministrator(role);
}

export function canManageSettings(role: UserRole): boolean {
  return isAdministrator(role);
}

export function canManageUsers(role: UserRole): boolean {
  return isAdministrator(role);
}
