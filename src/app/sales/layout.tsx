import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  employeeLoginRedirect,
  isSalesStaff,
} from "@/lib/employee-categories";
import { SalesSectionClient } from "@/components/sales/SalesSectionClient";

export const dynamic = "force-dynamic";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  if (session.role === "admin") {
    redirect("/");
  }

  if (session.role === "employee" && !isSalesStaff(session.roles)) {
    redirect(employeeLoginRedirect(session.roles));
  }

  return <SalesSectionClient>{children}</SalesSectionClient>;
}
