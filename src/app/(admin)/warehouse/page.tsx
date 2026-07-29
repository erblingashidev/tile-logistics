"use client";

import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui";
import { WarehouseNav } from "@/components/warehouse/WarehouseNav";

const workflow = [
  {
    href: "/warehouse/unload",
    title: "Unloading",
    description: "Truck arrives — scan lot barcode, enter m² → STAGING.",
  },
  {
    href: "/warehouse/mapping",
    title: "Mapping (put-away)",
    description:
      "Place stock on outdoor rows (e.g. D3-K1M = Depo 3, Kolona 1 Majtas).",
  },
];

const catalog = [
  {
    href: "/warehouse/stock",
    title: "Stock levels",
    description: "View m² by lot and row. Pro-Data sync and import.",
  },
  {
    href: "/warehouse/products",
    title: "Product lots",
    description: "Lot barcodes, tile specs, weight and pallet math for dispatch.",
  },
  {
    href: "/warehouse/locations",
    title: "Rows & sectors",
    description: "Outdoor row codes, sector zones, and group-leader assignments.",
  },
];

const operations = [
  {
    href: "/warehouse/inventory",
    title: "Annual inventory",
    description: "Open a count session and close sectors when done.",
  },
  {
    href: "/warehouse/reports",
    title: "Warehouse reports",
    description: "Incident and weekly reports from sector leaders.",
  },
];

function LinkGrid({
  items,
}: {
  items: Array<{ href: string; title: string; description: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <Link key={item.href} href={item.href}>
          <Card className="h-full p-5 transition hover:border-zinc-400">
            <p className="font-semibold text-zinc-900">{item.title}</p>
            <p className="mt-1 text-sm text-zinc-500">{item.description}</p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function WarehouseHomePage() {
  return (
    <AppShell
      title="Warehouse"
      description="Outdoor depot — unload, map to rows, pick for orders"
    >
      <WarehouseNav />

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Daily workflow
        </h2>
        <LinkGrid items={workflow} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Stock & catalog
        </h2>
        <LinkGrid items={catalog} />
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Counting & reports
        </h2>
        <LinkGrid items={operations} />
      </section>
    </AppShell>
  );
}
