import { redirect } from "next/navigation";
import { isWarehouseWmsEnabled } from "@/lib/services/feature-flags";

export const dynamic = "force-dynamic";

export default async function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isWarehouseWmsEnabled())) {
    redirect("/settings");
  }
  return children;
}
