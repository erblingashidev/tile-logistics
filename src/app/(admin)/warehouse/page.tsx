"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui";

const links = [
  { href: "/warehouse/locations", title: "Locations" },
  { href: "/warehouse/stock", title: "Stock & receiving" },
  { href: "/warehouse/products", title: "Product catalog" },
  { href: "/warehouse/reports", title: "Warehouse reports" },
  { href: "/warehouse/inventory", title: "Annual inventory" },
];

export default function WarehouseHomePage() {
  return (
    <AppShell title="Warehouse">
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full p-5 transition hover:border-zinc-400">
              <p className="font-semibold text-zinc-900">{item.title}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
