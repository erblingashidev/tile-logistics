import type { EmployeeRole } from "@/lib/constants";

export const ADMIN_EMPLOYEE_ROLE_OPTIONS: Array<{
  role: EmployeeRole;
  label: string;
  defaultTitle: string;
}> = [
  {
    role: "warehouse_admin",
    label: "Warehouse Lead",
    defaultTitle: "Warehouse Lead",
  },
  {
    role: "general_manager",
    label: "General Manager",
    defaultTitle: "General Manager",
  },
  { role: "ceo", label: "CEO", defaultTitle: "CEO" },
];

export function defaultTitleForAdminRole(role: EmployeeRole): string {
  const match = ADMIN_EMPLOYEE_ROLE_OPTIONS.find((option) => option.role === role);
  return match?.defaultTitle ?? role;
}

export function inferEmployeeRoleForAdmin(
  title?: string | null,
  employeeRole?: EmployeeRole
): EmployeeRole {
  if (employeeRole) return employeeRole;
  const normalized = (title ?? "").trim().toLowerCase();
  if (normalized.includes("ceo")) return "ceo";
  if (normalized.includes("general manager") || normalized === "gm") {
    return "general_manager";
  }
  if (
    normalized.includes("warehouse lead") ||
    normalized.includes("warehouse admin")
  ) {
    return "warehouse_admin";
  }
  return "warehouse_admin";
}
