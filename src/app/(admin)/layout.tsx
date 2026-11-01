import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";
import {
  employeeLoginRedirect,
  isCashierOnly,
} from "@/lib/employee-categories";
import { FeatureFlagsProvider } from "@/components/features/FeatureFlagsProvider";
import { CompanyProfileProvider } from "@/components/company/CompanyProfileProvider";
import { OrgPathProvider } from "@/components/organization/OrgPathProvider";
import { AdminSessionProvider } from "@/components/layout/AdminSessionProvider";
import { CashierLayoutGate } from "@/components/layout/CashierLayoutGate";
import { resolveSessionTenantSlug } from "@/lib/organizations/paths";
import type { EmployeeRole } from "@/lib/constants";
import { getOrganizationDisplayName } from "@/lib/services/organizations";

export const dynamic = "force-dynamic";

/** Server-side gate — pages cannot render without a valid session. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.role === "employee" && !isCashierOnly(session.roles)) {
    redirect(employeeLoginRedirect(session.roles));
  }

  if (session.role === "admin") {
    const platformAdmin =
      session.adminId === 0 || session.isPlatformAdmin === true;
    if (
      !platformAdmin &&
      session.onboardingComplete === false &&
      !isLegacyAgimiOrganization(session.organizationId)
    ) {
      redirect("/onboarding");
    }
  }

  const organizationSlug = resolveSessionTenantSlug(session);
  const platformAdmin =
    session.role === "admin" &&
    (session.adminId === 0 || session.isPlatformAdmin === true);
  const organizationId = session.organizationId ?? null;
  const organizationName =
    organizationId != null && organizationId > 0
      ? await getOrganizationDisplayName(organizationId)
      : null;

  const shellSession = {
    role: session.role,
    shellMode:
      session.role === "employee" ? ("cashier" as const) : ("admin" as const),
    roles:
      session.role === "employee" ? session.roles : ([] as EmployeeRole[]),
    name: session.name,
    isPlatformAdmin: platformAdmin,
    organizationId,
    organizationName,
  };

  return (
    <AdminSessionProvider session={shellSession}>
      <CashierLayoutGate>
        <OrgPathProvider organizationSlug={organizationSlug}>
          <FeatureFlagsProvider>
            <CompanyProfileProvider>{children}</CompanyProfileProvider>
          </FeatureFlagsProvider>
        </OrgPathProvider>
      </CashierLayoutGate>
    </AdminSessionProvider>
  );
}
