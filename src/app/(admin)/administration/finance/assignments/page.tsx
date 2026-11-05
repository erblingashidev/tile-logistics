"use client";

import { PendingInvoiceAssignmentQueue } from "@/components/administration/finance/PendingInvoiceAssignmentQueue";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

export default function FinanceInvoiceAssignmentsPage() {
  const t = useAppMessages();
  const q = t.finance.pages.assignmentQueue;

  return (
    <FinancePageShell title={q.title} description={q.description}>
      <PendingInvoiceAssignmentQueue />
    </FinancePageShell>
  );
}
