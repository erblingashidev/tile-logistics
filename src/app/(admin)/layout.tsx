import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";
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
    if (
      !platformAdmin &&
      session.onboardingComplete === false &&
      !isLegacyAgimiOrganization(session.organizationId)
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
