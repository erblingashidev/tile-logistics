"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/administration/finance/reports", label: "Overall reports" },
  { href: "/administration/finance/debts", label: "Open debts" },
  { href: "/administration/finance/debts/by-agent", label: "Debts by agent" },
  { href: "/administration/finance/debts/by-client", label: "Debts by client" },
  { href: "/administration/finance", label: "Register & ledger" },
  { href: "/administration/finance/imports", label: "Excel import" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/administration/finance") {
    return pathname === "/administration/finance";
  }
  if (href === "/administration/finance/debts") {
    return pathname === "/administration/finance/debts";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdministrationFinanceNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              active
                ? "bg-zinc-900 font-medium text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
