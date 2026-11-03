"use client";

import Link from "next/link";
import { useCompanyModules } from "@/components/company/CompanyProfileProvider";
import { useOrgPath } from "@/components/organization/OrgPathProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

function isActive(
  pathname: string,
  href: string,
  orgPath: (internal: string) => string
) {
  const target = orgPath(href);
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** Fixed nav for invoicing office — never includes admin-only routes. */
export function CashierNavLinks({
  pathname,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const modules = useCompanyModules();
  const { orgPath } = useOrgPath();
  const t = useAppMessages();

  const items = [
    { href: "/orders", label: t.nav.items.ordersInvoices },
    ...(modules.returns !== false
      ? [{ href: "/returns", label: t.nav.items.returns }]
      : []),
    ...(modules.administration !== false
      ? [{ href: "/administration", label: t.nav.items.cashRegister }]
      : []),
    { href: "/logs", label: t.nav.items.logs },
  ];

  return (
    <div className={mobile ? "mb-4" : "mb-3 last:mb-0"}>
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {t.nav.groups.invoicingOffice}
      </p>
      {items.map((item) => {
        const active = isActive(pathname, item.href, orgPath);
        return (
          <Link
            key={item.href}
            href={orgPath(item.href)}
            onClick={onNavigate}
            prefetch={true}
            className={`block rounded px-3 transition ${
              mobile ? "py-2.5 text-sm" : "py-2 text-sm"
            } ${
              active
                ? "bg-white/10 font-medium text-white"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
