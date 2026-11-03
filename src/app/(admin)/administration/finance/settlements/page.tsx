"use client";

import { ManagedProDataSettlements } from "@/components/administration/finance/ManagedProDataSettlements";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { Alert } from "@/components/ui";

export default function FinanceInvoiceSettlementsPage() {
  return (
    <FinancePageShell
      title="MENYRA E PAGESES — payment status"
      description="Set paid entirely, paid partially (with € amount), prepaid, unpaid, or on terms for every imported Pro-Data invoice. This drives open debts vs fully paid."
    >
      <div className="mb-4">
        <Alert tone="info">
          You can also set these values when importing Excel (after Preview), or on{" "}
          <strong>Open debts</strong> for invoices that still have a balance.
        </Alert>
      </div>
      <ManagedProDataSettlements />
    </FinancePageShell>
  );
}
