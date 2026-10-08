import { describe, expect, it } from "vitest";
import {
  assertSessionCanAccessOrganization,
  sessionCanAccessOrganization,
} from "@/lib/organizations/tenant-access";
import { TenantAccessError } from "@/lib/organizations/tenant-access-error";
import type { SessionUser } from "@/lib/auth/session";

const companyAdmin: SessionUser = {
  role: "admin",
  adminId: 10,
  name: "Owner",
  username: "owner",
  organizationId: 2,
  organizationSlug: "acme",
  isPlatformAdmin: false,
  onboardingComplete: true,
};

const companyBEmployee: SessionUser = {
  role: "employee",
  employeeId: 5,
  name: "Driver",
  roles: ["driver"],
  organizationId: 3,
  organizationSlug: "other",
};

const platformAdminInCompany: SessionUser = {
  role: "admin",
  adminId: 1,
  name: "Platform",
  username: "platform",
  organizationId: 2,
  organizationSlug: "acme",
  isPlatformAdmin: true,
  onboardingComplete: true,
};

const platformAdminNoCompany: SessionUser = {
  role: "admin",
  adminId: 1,
  name: "Platform",
  username: "platform",
  organizationId: null,
  organizationSlug: null,
  isPlatformAdmin: true,
  onboardingComplete: true,
};

describe("tenant access", () => {
  it("company admin can access own organization only", () => {
    expect(sessionCanAccessOrganization(companyAdmin, 2)).toBe(true);
    expect(sessionCanAccessOrganization(companyAdmin, 3)).toBe(false);
  });

  it("employee can access own organization only", () => {
    expect(sessionCanAccessOrganization(companyBEmployee, 3)).toBe(true);
    expect(sessionCanAccessOrganization(companyBEmployee, 2)).toBe(false);
  });

  it("platform admin in a company can access that company", () => {
    expect(sessionCanAccessOrganization(platformAdminInCompany, 2)).toBe(true);
    expect(sessionCanAccessOrganization(platformAdminInCompany, 3)).toBe(false);
  });

  it("platform admin without selected company cannot access tenant data", () => {
    expect(sessionCanAccessOrganization(platformAdminNoCompany, 2)).toBe(false);
  });

  it("assertSessionCanAccessOrganization throws TenantAccessError", () => {
    expect(() =>
      assertSessionCanAccessOrganization(companyAdmin, 99)
    ).toThrow(TenantAccessError);
  });
});
