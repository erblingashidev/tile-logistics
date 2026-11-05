"use client";

import Link from "next/link";
import { useOrgPath } from "@/components/organization/OrgPathProvider";

export type InvoiceFinanceTarget =
  | "debts"
  | "assignments"
  | "register";

function hrefFor(
  orgPath: (p: string) => string,
  invoiceNumber: string,
  target: InvoiceFinanceTarget
) {
  const q = encodeURIComponent(invoiceNumber.trim());
  const base =
    target === "assignments"
      ? "/administration/finance/assignments"
      : target === "register"
        ? "/administration/finance"
        : "/administration/finance/debts";
  return orgPath(`${base}?q=${q}`);
}

export function InvoiceFinanceLink({
  invoiceNumber,
  target = "debts",
  className = "font-mono text-sm font-medium text-blue-700 hover:underline",
}: {
  invoiceNumber: string;
  target?: InvoiceFinanceTarget;
  className?: string;
}) {
  const { orgPath } = useOrgPath();
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return <>—</>;
  return (
    <Link href={hrefFor(orgPath, trimmed, target)} className={className}>
      {trimmed}
    </Link>
  );
}
