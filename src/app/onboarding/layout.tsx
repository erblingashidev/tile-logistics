import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

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
    session.role === "admin" &&
    (session.adminId === 0 || session.isPlatformAdmin === true);
  if (session.onboardingComplete && !platformAdmin) {
    redirect("/");
  }
  return <>{children}</>;
}
