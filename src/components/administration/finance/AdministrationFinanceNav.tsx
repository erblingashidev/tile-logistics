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
  {
    href: "/administration/finance/settlements",
    key: "paymentStatus" as const,
  },
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
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={`${link.href}${querySuffix}`}
            className={`rounded-full px-4 py-2 text-base font-semibold shadow-sm transition ${
              active
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {t.finance.nav[link.key]}
          </Link>
        );
      })}
    </nav>
  );
}
