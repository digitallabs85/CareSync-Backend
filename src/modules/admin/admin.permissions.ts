// Single source of truth for what each admin role may do.
// Enforced on the server in two places: route middleware (requirePermission)
// and again inside the service layer (assertCan). The frontend only mirrors
// this to hide buttons — it is never what protects anything.

export const ADMIN_ROLES = ["super_admin", "admin", "support"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type Permission =
  | "dashboard:view"
  | "clinics:view" | "clinics:create" | "clinics:update" | "clinics:delete"
  | "doctors:view" | "doctors:create" | "doctors:update" | "doctors:delete"
  | "assignments:manage"
  | "audit:view"
  | "admins:view" | "admins:create" | "admins:update" | "admins:delete";

// support: read-only
const SUPPORT: Permission[] = ["dashboard:view", "clinics:view", "doctors:view"];

// admin: day-to-day operations, but cannot create admins and cannot delete anything
const ADMIN: Permission[] = [
  ...SUPPORT,
  "clinics:create", "clinics:update",
  "doctors:create", "doctors:update",
  "assignments:manage",
  "audit:view",
];

// super_admin: everything
const SUPER_ADMIN: Permission[] = [
  ...ADMIN,
  "clinics:delete", "doctors:delete",
  "admins:view", "admins:create", "admins:update", "admins:delete",
];

const MATRIX: Record<AdminRole, ReadonlySet<Permission>> = {
  super_admin: new Set(SUPER_ADMIN),
  admin: new Set(ADMIN),
  support: new Set(SUPPORT),
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function can(role: unknown, permission: Permission): boolean {
  return isAdminRole(role) && MATRIX[role].has(permission);
}
