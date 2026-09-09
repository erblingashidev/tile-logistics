import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/login");
  const platformAdmin =
    session.adminId === 0 || session.isPlatformAdmin === true;
  if (!platformAdmin && isLegacyAgimiOrganization(session.organizationId)) {
    redirect("/");
  }
  if (!platformAdmin && session.onboardingComplete) {
    redirect("/");
  }
  return <>{children}</>;
}
