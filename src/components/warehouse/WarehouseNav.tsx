"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WMS_ENABLED } from "@/lib/features/wms-enabled";

const links = [
  { href: "/warehouse", label: "Overview", exact: true },
  { href: "/warehouse/unload", label: "Unloading" },
  { href: "/warehouse/mapping", label: "Mapping" },
  { href: "/warehouse/stock", label: "Stock levels" },
  { href: "/warehouse/products", label: "Product lots" },
  { href: "/warehouse/locations", label: "Rows & sectors" },
  { href: "/warehouse/inventory", label: "Annual inventory" },
  { href: "/warehouse/reports", label: "Reports" },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WarehouseNav() {
  const pathname = usePathname();

  if (!WMS_ENABLED) return null;

  return (
    <nav
      aria-label="Warehouse"
      className="mb-6 -mx-1 overflow-x-auto pb-1"
    >
      <div className="flex min-w-max gap-1 rounded-xl bg-zinc-100 p-1 ring-1 ring-zinc-200/80">
        {links.map((item) => {
          const active = isActive(pathname, item.href, "exact" in item && item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export const WAREHOUSE_SIDEBAR_LINKS = links.map(({ href, label }) => ({
  href,
  label,
}));
