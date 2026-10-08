import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";
import { isWarehouseWmsEnabled } from "@/lib/services/feature-flags";

export const dynamic = "force-dynamic";

export default async function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const orgId = session.organizationId ?? DEFAULT_ORGANIZATION_ID;
  if (!(await isWarehouseWmsEnabled(orgId))) {
    redirect("/settings");
  }
  return children;
}
