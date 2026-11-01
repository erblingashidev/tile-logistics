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
import { resolveSessionTenantSlug } from "@/lib/organizations/paths";
import type { EmployeeRole } from "@/lib/constants";

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

  const shellSession = {
    role: session.role,
    roles:
      session.role === "employee" ? session.roles : ([] as EmployeeRole[]),
    name: session.name,
    isPlatformAdmin: platformAdmin,
    organizationId: session.organizationId ?? null,
  };

  return (
    <AdminSessionProvider session={shellSession}>
      <OrgPathProvider organizationSlug={organizationSlug}>
        <FeatureFlagsProvider>
          <CompanyProfileProvider>{children}</CompanyProfileProvider>
        </FeatureFlagsProvider>
      </OrgPathProvider>
    </AdminSessionProvider>
  );
}
