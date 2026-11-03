import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";
import type { ClientFinanceProfile } from "@/components/administration/AdministrationClientFinance";

/** Split query into lowercase tokens (all must match somewhere). */
export function financeSearchTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function financeTextMatchesQuery(blob: string, query: string): boolean {
  const tokens = financeSearchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = blob.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function debtInvoiceSearchBlob(row: DebtInvoiceLine): string {
  return [
    row.displayName,
    row.clientKey,
    row.invoiceNumber,
    row.salesAgentName,
    row.location,
    row.orderStatus,
    row.orderDate,
    String(row.daysOutstanding),
    String(row.balanceDueCents / 100),
    String(row.invoicedCents / 100),
  ]
    .filter(Boolean)
    .join(" ");
}

export function debtInvoiceMatchesSearch(
  row: DebtInvoiceLine,
  query: string
): boolean {
  return financeTextMatchesQuery(debtInvoiceSearchBlob(row), query);
}

export function clientProfileSearchBlob(profile: ClientFinanceProfile): string {
  const parts: string[] = [
    profile.displayName,
    profile.clientKey,
    ...profile.callReasons,
  ];
  for (const inv of profile.invoices) {
    parts.push(
      inv.invoiceNumber,
      inv.salesAgentName ?? "",
      inv.location ?? "",
      inv.orderStatus ?? "",
      inv.orderDate ?? ""
    );
  }
  for (const line of profile.registerLines) {
    parts.push(
      line.invoiceReference ?? "",
      line.purpose ?? "",
      line.kind,
      line.paymentMethod ?? ""
    );
  }
  return parts.filter(Boolean).join(" ");
}

export function clientProfileMatchesSearch(
  profile: ClientFinanceProfile,
  query: string
): boolean {
  return financeTextMatchesQuery(clientProfileSearchBlob(profile), query);
}
