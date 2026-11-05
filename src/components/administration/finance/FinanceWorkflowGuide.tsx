"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFinanceSearch } from "@/components/administration/finance/FinanceSearchProvider";
import { useOrgPath } from "@/components/organization/OrgPathProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import type { AppMessages } from "@/lib/i18n/messages/en";

function pageGuideKey(
  pathname: string
): keyof AppMessages["finance"]["workflow"]["pages"] | null {
  if (pathname.endsWith("/finance/assignments")) return "assignments";
  if (pathname.endsWith("/finance/imports")) return "import";
  if (pathname.endsWith("/finance/debts/by-agent")) return "byAgent";
  if (pathname.endsWith("/finance/debts/by-client")) return "byClient";
  if (pathname.endsWith("/finance/debts")) return "openDebts";
  if (pathname.endsWith("/finance/reports")) return "reports";
  if (pathname.endsWith("/finance/settlements")) return "assignments";
  if (pathname.match(/\/finance\/?$/)) return "register";
  return null;
}

export function FinanceWorkflowGuide() {
  const pathname = usePathname();
  const t = useAppMessages();
  const { query } = useFinanceSearch();
  const { orgPath } = useOrgPath();
  const key = pageGuideKey(pathname);
  const w = t.finance.workflow;

  const q = query.trim();
  const qEnc = q ? encodeURIComponent(q) : "";

  return (
    <div className="mb-6 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm text-zinc-700">
      <p>{w.invoiceKey}</p>
      {key ? <p className="font-medium text-zinc-900">{w.pages[key]}</p> : null}
      {q ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">
            {w.activeInvoice.replace("{invoice}", q)}
          </span>
          <Link
            href={orgPath(`/administration/finance/debts?q=${qEnc}`)}
            className="font-medium text-blue-700 hover:underline"
          >
            {w.jump.debts}
          </Link>
          <Link
            href={orgPath(`/administration/finance/assignments?q=${qEnc}`)}
            className="font-medium text-blue-700 hover:underline"
          >
            {w.jump.assign}
          </Link>
          <Link
            href={orgPath(`/administration/finance?q=${qEnc}`)}
            className="font-medium text-blue-700 hover:underline"
          >
            {w.jump.register}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
