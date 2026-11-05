"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { useAdministrationSettings } from "@/components/administration/AdministrationSettingsProvider";
import { useAdministrationPermissions } from "@/components/administration/useAdministrationPermissions";
import { useOrgPath } from "@/components/organization/OrgPathProvider";

const LINKS = [
  { href: "/administration/finance/imports", key: "excelImport" as const },
  {
    href: "/administration/finance/assignments",
    key: "assignmentQueue" as const,
  },
  { href: "/administration/finance/debts", key: "openDebts" as const },
  { href: "/administration/finance/debts/by-agent", key: "byAgent" as const },
  { href: "/administration/finance/debts/by-client", key: "byClient" as const },
  { href: "/administration/finance", key: "registerLedger" as const },
  { href: "/administration/finance/reports", key: "reports" as const },
] as const;

function isActive(pathname: string, href: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (href === "/administration/finance") {
    return path.endsWith("/administration/finance");
  }
  if (href === "/administration/finance/debts") {
    return path.endsWith("/administration/finance/debts");
  }
  if (href === "/administration/finance/assignments") {
    return path.endsWith("/administration/finance/assignments");
  }
  return path === href || path.endsWith(href);
}

export function AdministrationFinanceNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useAppMessages();
  const { orgPath } = useOrgPath();
  const { cashRegisterEnabled } = useAdministrationSettings();
  const { canReports } = useAdministrationPermissions();
  const q = searchParams.get("q");
  const day = searchParams.get("day");
  const params = new URLSearchParams();
  if (day) params.set("day", day);
  if (q) params.set("q", q);
  const querySuffix = params.toString() ? `?${params.toString()}` : "";
  const links = LINKS.filter((link) => {
    if (link.href === "/administration/finance" && !cashRegisterEnabled) {
      return false;
    }
    if (link.href === "/administration/finance/reports" && !canReports) {
      return false;
    }
    return true;
  });
  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-4">
      {links.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={`${orgPath(link.href)}${querySuffix}`}
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
