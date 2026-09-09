import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LEGACY_AGIMI_ORGANIZATION_ID } from "@/lib/services/organizations";
import {
  employeeLoginRedirect,
} from "@/lib/employee-categories";
import { FeatureFlagsProvider } from "@/components/features/FeatureFlagsProvider";
import { CompanyProfileProvider } from "@/components/company/CompanyProfileProvider";

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

  if (session.role === "employee") {
    redirect(employeeLoginRedirect(session.roles));
  }

  if (session.role === "admin") {
    const platformAdmin =
      session.adminId === 0 || session.isPlatformAdmin === true;
    const legacyAgimiAdmin =
      session.organizationId == null ||
      session.organizationId === LEGACY_AGIMI_ORGANIZATION_ID;
    if (
      !platformAdmin &&
      session.onboardingComplete === false &&
      !legacyAgimiAdmin
    ) {
      redirect("/onboarding");
    }
  }

  return (
    <FeatureFlagsProvider>
      <CompanyProfileProvider>{children}</CompanyProfileProvider>
    </FeatureFlagsProvider>
  );
}
