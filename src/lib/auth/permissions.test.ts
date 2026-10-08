import { describe, expect, it } from "vitest";
import { PERMISSIONS, sessionHasPermission } from "@/lib/auth/permissions";

describe("permissions", () => {
  it("grants company admins all permissions", () => {
    expect(
      sessionHasPermission(
        {
          role: "admin",
          adminId: 1,
          name: "Admin",
          username: "admin",
          organizationId: 1,
          isPlatformAdmin: false,
        },
        PERMISSIONS.ordersWrite
      )
    ).toBe(true);
  });

  it("limits sales staff to order read", () => {
    const session = {
      role: "employee" as const,
      employeeId: 1,
      name: "Sales",
      pin: "0000",
      roles: ["sales_agent" as const],
      organizationId: 1,
    };
    expect(sessionHasPermission(session, PERMISSIONS.ordersRead)).toBe(true);
    expect(sessionHasPermission(session, PERMISSIONS.ordersWrite)).toBe(false);
  });

  it("allows warehouse lead management permissions", () => {
    const session = {
      role: "employee" as const,
      employeeId: 2,
      name: "Lead",
      pin: "0000",
      roles: ["warehouse_admin" as const],
      organizationId: 1,
    };
    expect(sessionHasPermission(session, PERMISSIONS.warehouseWrite)).toBe(true);
    expect(sessionHasPermission(session, PERMISSIONS.adminsWrite)).toBe(true);
  });
});
