import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { BRAND } from "@/lib/brand";
import { getDashboardStats } from "@/lib/services/orders";
import { pendingImportQueueCount } from "@/lib/services/invoice-import-queue";
import { Badge, Card, StatLink } from "@/components/ui";

const modules = [
  { href: "/orders", label: "Orders", desc: "Orders and assignments" },
  { href: "/dispatch", label: "Dispatch", desc: "Fleet load and assignments" },
  { href: "/routes", label: "Routes", desc: "Route planning" },
  { href: "/map", label: "Map", desc: "Delivery map" },
  { href: "/warehouse", label: "Warehouse", desc: "Stock and inventory" },
  { href: "/vehicles", label: "Vehicles", desc: "Fleet capacity" },
  { href: "/employees", label: "Employees", desc: "Staff and roles" },
  { href: "/admins", label: "Admins", desc: "Administrator accounts" },
  { href: "/reports", label: "Reports", desc: "Exports" },
  { href: "/logs", label: "Logs", desc: "Activity log" },
];

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, pendingImports] = await Promise.all([
    getDashboardStats(),
    pendingImportQueueCount(),
  ]);
  const wh = BRAND.warehouse;

  return (
    <AppShell
      title="Dashboard"
      description={`${wh.address}, ${wh.country}`}
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatLink
          label="Pending imports"
          value={pendingImports}
          href="/orders"
          hint="Awaiting review"
          accent={pendingImports > 0 ? "amber" : "default"}
        />
        <StatLink
          label="Open orders"
          value={stats.totalOrders}
          href="/orders"
          hint="All active orders"
        />
        <StatLink
          label="Unassigned"
          value={stats.unassignedOrders}
          href="/orders"
          hint="Need truck assignment"
          accent={stats.unassignedOrders > 0 ? "blue" : "default"}
        />
        <StatLink
          label="Pallets pending"
          value={stats.totalPalletsPending}
          href="/dispatch"
          hint="Unassigned pallet count"
        />
        <StatLink
          label="Vehicles available"
          value={stats.vehiclesAvailable}
          href="/vehicles"
          hint="Ready for dispatch"
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
          Warehouse map
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
              </div>
              <p className="mt-1 text-sm text-zinc-500">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
