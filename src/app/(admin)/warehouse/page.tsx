"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui";

const links = [
  {
    href: "/warehouse/locations",
    title: "Locations",
    desc: "All bins and stock at each place",
  },
  {
    href: "/warehouse/stock",
    title: "Stock & receiving",
    desc: "Balances and inbound receipts",
  },
  {
    href: "/warehouse/products",
    title: "Product catalog",
    desc: "EAN codes and dimensions",
  },
  {
    href: "/warehouse/reports",
    title: "Warehouse reports",
    desc: "Wednesday weekly reports and incidents",
  },
  {
    href: "/warehouse/inventory",
    title: "Annual inventory",
    desc: "Count sessions",
  },
];

export default function WarehouseHomePage() {
  return (
    <AppShell title="Warehouse (WMS)" description="Stock, catalog, and inventory.">
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full p-5 transition hover:border-zinc-400">
              <p className="font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
