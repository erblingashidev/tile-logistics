import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { BRAND } from "@/lib/brand";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { getDashboardStats } from "@/lib/services/orders";
import { pendingImportQueueCount } from "@/lib/services/invoice-import-queue";
import { Badge, Card, StatLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, pendingImports, flags] = await Promise.all([
    getDashboardStats(),
    pendingImportQueueCount(),
    getFeatureFlags(),
  ]);
  const modules = [
    { href: "/orders", label: "Orders" },
    ...(flags.operationsSuite
      ? [
          { href: "/dispatch", label: "Dispatch" },
          { href: "/map", label: "Map" },
        ]
      : []),
    ...(flags.warehouseWms ? [{ href: "/warehouse", label: "Warehouse" }] : []),
    { href: "/vehicles", label: "Vehicles" },
    { href: "/employees", label: "Employees" },
    { href: "/admins", label: "Admins" },
    { href: "/reports", label: "Reports" },
    { href: "/logs", label: "Logs" },
    { href: "/settings", label: "Settings" },
  ];
  const wh = BRAND.warehouse;

  return (
    <AppShell
      title="Dashboard"
      description={
        flags.operationsSuite
          ? "Today’s open work"
          : "Orders, reports, and delivery records"
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatLink
          label="Pending imports"
          value={pendingImports}
          href="/orders"
          hint="Invoice queue"
          accent={pendingImports > 0 ? "amber" : "default"}
        />
        <StatLink
          label="Open today"
          value={stats.totalOrders}
          href="/orders?workDay=today"
          hint="This work day"
        />
        <StatLink
          label="Unassigned"
          value={stats.unassignedOrders}
          href="/orders?workDay=today&assignment=unassigned"
          hint="Need a truck"
          accent={stats.unassignedOrders > 0 ? "blue" : "default"}
        />
        <StatLink
          label="Overdue"
          value={stats.overdueOrders}
          href="/orders?workDay=overdue"
          hint="Past delivery date"
          accent={stats.overdueOrders > 0 ? "amber" : "default"}
        />
        <StatLink
          label="Pallets pending"
          value={stats.totalPalletsPending}
          href={flags.operationsSuite ? "/dispatch" : "/orders?workDay=today&assignment=unassigned"}
          hint="Unassigned today"
        />
        <StatLink
          label="Vehicles available"
          value={stats.vehiclesAvailable}
          href="/vehicles"
        />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Quick access
        </h2>
        <a
          href={wh.osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 underline hover:text-zinc-800"
        >
          Depot map
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card interactive className="h-full p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-zinc-900">{m.label}</p>
                {m.href === "/orders" && pendingImports > 0 ? (
                  <Badge tone="amber">{pendingImports} import</Badge>
                ) : null}
                {m.href === "/dispatch" && stats.unassignedOrders > 0 ? (
                  <Badge tone="blue">{stats.unassignedOrders} open</Badge>
                ) : null}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
