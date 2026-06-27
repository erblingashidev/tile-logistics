import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  employeeLoginRedirect,
  isSalesStaff,
} from "@/lib/employee-categories";

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

  if (session.role === "employee" && !isSalesStaff(session.roles)) {
    redirect(employeeLoginRedirect(session.roles));
  }

  return children;
}
