import type { AppMessages } from "@/lib/i18n/messages/en";
import type { InvoiceSettlementStatus } from "@/lib/administration/invoice-settlement";

export function settlementLabel(
  t: AppMessages,
  id: string | null | undefined
): string {
  if (!id) return "—";
  const labels = t.finance.settlement.statuses;
  return labels[id as InvoiceSettlementStatus] ?? id.replace(/_/g, " ");
}
