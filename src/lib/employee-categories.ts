import {
  EMPLOYEE_CATEGORIES,
  type EmployeeCategoryId,
  type EmployeeRole,
} from "@/lib/constants";

export const WAREHOUSE_ROLES: EmployeeRole[] = [
  "warehouse_admin",
  "warehouse_reporter",
  "group_leader",
  "picker",
  "driver",
  "unloader",
  "maintainer",
];

export const SALES_ROLES: EmployeeRole[] = [
  "sales_admin",
  "sales_agent",
  "showroom_picker",
];

export const FACILITY_ROLES: EmployeeRole[] = ["cleaner"];

export const WMS_STAFF_ROLES: EmployeeRole[] = [
  "warehouse_admin",
  "warehouse_reporter",
  "group_leader",
  "picker",
  "unloader",
  "maintainer",
];

export const WAREHOUSE_REPORT_ROLES: EmployeeRole[] = [
  "group_leader",
  "warehouse_reporter",
  "warehouse_admin",
  "picker",
  "unloader",
];

export const WAREHOUSE_WEEKLY_REPORT_ROLES: EmployeeRole[] = [
  "group_leader",
  "warehouse_reporter",
  "warehouse_admin",
];

const CATEGORY_ORDER: EmployeeCategoryId[] = [
  "warehouse",
  "sales",
  "showroom",
  "facility",
];

export function roleCategory(role: EmployeeRole): EmployeeCategoryId {
  for (const cat of EMPLOYEE_CATEGORIES) {
    if ((cat.roles as readonly string[]).includes(role)) {
      return cat.id;
    }
  }
  return "facility";
}

export function primaryCategory(roles: EmployeeRole[]): EmployeeCategoryId {
  for (const id of CATEGORY_ORDER) {
    const cat = EMPLOYEE_CATEGORIES.find((c) => c.id === id)!;
    if (roles.some((r) => (cat.roles as readonly string[]).includes(r))) {
      return id;
    }
  }
  return "facility";
}

export function isWarehouseStaff(roles: EmployeeRole[]): boolean {
  return roles.some((r) => WAREHOUSE_ROLES.includes(r));
}

export function isSalesStaff(roles: EmployeeRole[]): boolean {
  return roles.some((r) => SALES_ROLES.includes(r));
}

export function isSalesAdmin(roles: EmployeeRole[]): boolean {
  return roles.includes("sales_admin");
}

export function isSalesAgent(roles: EmployeeRole[]): boolean {
  return roles.includes("sales_agent");
}

export function isShowroomStaff(roles: EmployeeRole[]): boolean {
  return roles.includes("showroom_picker");
}

export function usesAlbanianPortal(roles: EmployeeRole[]): boolean {
  return isWarehouseStaff(roles);
}

export const SALES_HOME = "/sales";

export function employeeLoginRedirect(roles: EmployeeRole[]): string {
  if (isSalesStaff(roles)) return SALES_HOME;
  if (isWarehouseStaff(roles)) return "/portal";
  return "/portal/no-access";
}

export function categoryLabel(id: EmployeeCategoryId): string {
  return EMPLOYEE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
