"use client";

import { AdministrationFinanceImport } from "@/components/administration/AdministrationFinanceImport";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

export default function AdministrationFinanceImportsPage() {
  const t = useAppMessages();
  const p = t.finance.pages.import;

  return (
    <FinancePageShell title={p.title}>
      <AdministrationFinanceImport />
    </FinancePageShell>
  );
}
