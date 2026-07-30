import type { EmployeeRole } from "@/lib/constants";
import { WMS_STAFF_ROLES } from "@/lib/employee-categories";
import { WMS_ENABLED } from "@/lib/features/wms-enabled";

export function employeeShowDepotNav(roles: EmployeeRole[]): boolean {
  return WMS_ENABLED && roles.some((r) => WMS_STAFF_ROLES.includes(r));
}
