"use client";

import { ManagedProDataSettlements } from "@/components/administration/finance/ManagedProDataSettlements";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert } from "@/components/ui";

export default function FinanceInvoiceSettlementsPage() {
  const t = useAppMessages();
  const p = t.finance.pages.settlements;

  return (
    <FinancePageShell title={p.title} description={p.description}>
      <div className="mb-4">
        <Alert tone="info">{p.alsoHint}</Alert>
      </div>
      <ManagedProDataSettlements />
    </FinancePageShell>
  );
}
