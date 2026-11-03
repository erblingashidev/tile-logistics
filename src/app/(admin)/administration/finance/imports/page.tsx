"use client";

import Link from "next/link";
import { AdministrationFinanceImport } from "@/components/administration/AdministrationFinanceImport";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Button } from "@/components/ui";

export default function AdministrationFinanceImportsPage() {
  const t = useAppMessages();
  const p = t.finance.pages.import;

  return (
    <FinancePageShell title={p.title} description={p.description}>
      <div className="mb-6">
        <Link href="/administration/finance/reports">
          <Button variant="secondary">{p.backToReports}</Button>
        </Link>
      </div>
      <AdministrationFinanceImport />
    </FinancePageShell>
  );
}
