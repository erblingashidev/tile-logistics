import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { BRAND } from "@/lib/brand";
import { getDashboardStats } from "@/lib/services/orders";
import { Card, StatCard } from "@/components/ui";

const modules = [
  { href: "/orders", label: "Orders", desc: "Invoices & deliveries" },
  { href: "/routes", label: "Routes", desc: "Trip planning" },
  { href: "/vehicles", label: "Vehicles", desc: "Fleet & capacity" },
  { href: "/employees", label: "Employees", desc: "Team & access" },
  { href: "/logs", label: "Logs", desc: "Activity history" },
  { href: "/reports", label: "Reports", desc: "Exports" },
];

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const wh = BRAND.warehouse;

  return (
    <AppShell title="Dashboard" description="Overview and quick navigation.">
      <Card className="mb-6 p-4">
        <p className="text-sm font-medium text-zinc-900">{BRAND.name}</p>
        <p className="mt-1 text-sm text-zinc-600">{wh.address}, {wh.country}</p>
        <a
          href={wh.osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-xs text-zinc-500 underline hover:text-zinc-800"
        >
          View warehouse on OpenStreetMap →
        </a>
      </Card>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open orders" value={stats.totalOrders} />
        <StatCard label="Unassigned" value={stats.unassignedOrders} />
        <StatCard label="Pallets pending" value={stats.totalPalletsPending} />
        <StatCard label="Vehicles available" value={stats.vehiclesAvailable} />
      </div>

      <div className="grid max-w-2xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.href} href={m.href}>
            <Card className="p-4 transition hover:border-zinc-400">
              <p className="font-medium text-zinc-900">{m.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{m.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
