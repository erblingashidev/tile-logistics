"use client";

import Link from "next/link";
import { useCompanyModules } from "@/components/company/CompanyProfileProvider";
import { useOrgPath } from "@/components/organization/OrgPathProvider";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
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

  const items = [
    { href: "/orders", label: "Orders & invoices" },
    ...(modules.returns !== false ? [{ href: "/returns", label: "Returns" }] : []),
    ...(modules.administration !== false
      ? [{ href: "/administration", label: "Administration" }]
      : []),
    { href: "/logs", label: "Logs" },
  ];

  return (
    <div className={mobile ? "mb-4" : "mb-3 last:mb-0"}>
      <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Invoicing office
      </p>
      {items.map((item) => {
        const active = isActive(pathname, item.href);
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
