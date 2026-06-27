"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui";

const links = [
  {
    href: "/warehouse/stock",
    title: "Stock & receiving",
    desc: "View balances, record inbound from trucks, warehouse locations.",
  },
  {
    href: "/warehouse/products",
    title: "Product catalog",
    desc: "EAN codes learned from invoices, receiving, and inventory.",
  },
  {
    href: "/warehouse/inventory",
    title: "Annual inventory",
    desc: "Open a count session — staff scan EAN + m² on phones.",
  },
];

export default function WarehouseHomePage() {
  return (
    <AppShell title="Warehouse (WMS)">
      <p className="mb-6 max-w-2xl text-sm text-zinc-600">
        Stock is linked to product EAN codes. New products are registered automatically
        when orders are imported or when staff unload a truck. ProData sales integration
        is planned — see docs/PRODATA-INTEGRATION.md.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full p-5 transition hover:border-zinc-400">
              <p className="font-semibold text-zinc-900">{item.title}</p>
              <p className="mt-2 text-sm text-zinc-600">{item.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
