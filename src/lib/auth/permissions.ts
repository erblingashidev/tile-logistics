import type { EmployeeRole } from "@/lib/constants";
import type { SessionUser } from "@/lib/auth/session";

/** Stable permission keys for RBAC (maps to spec permission strings). */
export const PERMISSIONS = {
  ordersRead: "orders:read",
  ordersWrite: "orders:write",
  dispatchRead: "dispatch:read",
  dispatchWrite: "dispatch:write",
  employeesRead: "employees:read",
  employeesWrite: "employees:write",
  vehiclesRead: "vehicles:read",
  vehiclesWrite: "vehicles:write",
  warehouseRead: "warehouse:read",
  warehouseWrite: "warehouse:write",
  reportsRead: "reports:read",
  settingsWrite: "settings:write",
  adminsWrite: "admins:write",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = new Set<Permission>(Object.values(PERMISSIONS));

const SALES_READ: Permission[] = [PERMISSIONS.ordersRead];
const DRIVER_READ: Permission[] = [
  PERMISSIONS.ordersRead,
  PERMISSIONS.dispatchRead,
];
const WAREHOUSE_STAFF: Permission[] = [
  PERMISSIONS.ordersRead,
  PERMISSIONS.warehouseRead,
  PERMISSIONS.warehouseWrite,
];
const WAREHOUSE_LEAD: Permission[] = [
  ...WAREHOUSE_STAFF,
  PERMISSIONS.dispatchRead,
  PERMISSIONS.reportsRead,
];
const MANAGEMENT: Permission[] = [
  PERMISSIONS.ordersRead,
  PERMISSIONS.ordersWrite,
  PERMISSIONS.dispatchRead,
  PERMISSIONS.dispatchWrite,
  PERMISSIONS.employeesRead,
  PERMISSIONS.employeesWrite,
  PERMISSIONS.vehiclesRead,
  PERMISSIONS.vehiclesWrite,
  PERMISSIONS.warehouseRead,
  PERMISSIONS.warehouseWrite,
  PERMISSIONS.reportsRead,
  PERMISSIONS.settingsWrite,
  PERMISSIONS.adminsWrite,
];

function permissionsForRole(role: EmployeeRole): Permission[] {
  switch (role) {
    case "ceo":
    case "general_manager":
    case "warehouse_admin":
      return MANAGEMENT;
    case "sales_admin":
    case "sales_agent":
      return SALES_READ;
    case "driver":
      return DRIVER_READ;
    case "warehouse_reporter":
    case "group_leader":
    case "picker":
    case "unloader":
    case "maintainer":
      return WAREHOUSE_STAFF;
    case "showroom_picker":
      return [PERMISSIONS.ordersRead, PERMISSIONS.warehouseRead];
    case "cleaner":
      return [];
    default:
      return [];
  }
}

export function resolvePermissionsForEmployeeRoles(
  roles: EmployeeRole[]
): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const p of permissionsForRole(role)) out.add(p);
  }
  return out;
}

export function resolvePermissionsForSession(
  session: SessionUser
): Set<Permission> {
  if (session.role === "admin") return ALL_PERMISSIONS;
  return resolvePermissionsForEmployeeRoles(session.roles);
}

export function sessionHasPermission(
  session: SessionUser,
  permission: Permission
): boolean {
  return resolvePermissionsForSession(session).has(permission);
}
