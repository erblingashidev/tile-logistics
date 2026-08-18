import type { EmployeeRole } from "@/lib/constants";
import { WMS_STAFF_ROLES } from "@/lib/employee-categories";

export function employeeShowDepotNav(
  roles: EmployeeRole[],
  warehouseWms = false
): boolean {
  return warehouseWms && roles.some((r) => WMS_STAFF_ROLES.includes(r));
}
