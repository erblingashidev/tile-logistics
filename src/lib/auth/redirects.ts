import { employeeLoginRedirect } from "@/lib/employee-categories";
import { tenantPathForSession } from "@/lib/organizations/paths";
import type { SessionUser } from "@/lib/auth/session";

export function postLoginRedirect(user: SessionUser): string {
  if (user.role === "employee") {
    return tenantPathForSession(user, employeeLoginRedirect(user.roles));
  }
  if (user.adminId === 0 || user.isPlatformAdmin === true) {
    if (user.organizationId == null || user.organizationId <= 0) {
      return "/platform/companies";
    }
  }
  if (user.onboardingComplete === false) {
    return tenantPathForSession(user, "/onboarding");
  }
  return tenantPathForSession(user, "/");
}
