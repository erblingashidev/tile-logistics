"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

const LINKS = [
  { href: "/administration/finance/reports", key: "reports" as const },
  { href: "/administration/finance/debts", key: "openDebts" as const },
  { href: "/administration/finance/debts/by-agent", key: "byAgent" as const },
  { href: "/administration/finance/debts/by-client", key: "byClient" as const },
  { href: "/administration/finance", key: "registerLedger" as const },
  { href: "/administration/finance/imports", key: "excelImport" as const },
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
  const searchParams = useSearchParams();
  const t = useAppMessages();
  const q = searchParams.get("q");
  const querySuffix = q ? `?q=${encodeURIComponent(q)}` : "";
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={`${link.href}${querySuffix}`}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              active
                ? "bg-zinc-900 font-medium text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {t.finance.nav[link.key]}
          </Link>
        );
      })}
    </nav>
  );
}
