"use client";

import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { DebtSettlementSummary } from "@/components/administration/finance/DebtSettlementSummary";
import { InvoiceFinanceLink } from "@/components/administration/finance/InvoiceFinanceLink";
import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Button, Card, EmptyState } from "@/components/ui";

export function OpenDebtsTable({
  rows,
  onOpenClient,
}: {
  rows: DebtInvoiceLine[];
  onOpenClient: (clientKey: string) => void;
}) {
  const t = useAppMessages();
  const tbl = t.finance.table;

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title={tbl.noOpenDebts} />
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">{tbl.agent}</th>
            <th className="px-3 py-2">{tbl.client}</th>
            <th className="px-3 py-2">{tbl.invoice}</th>
            <th className="px-3 py-2">{tbl.orderDate}</th>
            <th className="px-3 py-2">{tbl.days}</th>
            <th className="px-3 py-2">{tbl.invoiced}</th>
            <th className="px-3 py-2">{tbl.due}</th>
            <th className="px-3 py-2">{tbl.paymentStatus}</th>
            <th className="px-3 py-2 text-right">{tbl.clientCard}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.invoiceNumber}-${row.clientKey}`} className="border-t">
              <td className="px-3 py-2">{row.salesAgentName}</td>
              <td className="px-3 py-2 font-medium">{row.displayName}</td>
              <td className="px-3 py-2">
                <InvoiceFinanceLink invoiceNumber={row.invoiceNumber} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.orderDate
                  ? format(new Date(row.orderDate), "d MMM yyyy")
                  : "—"}
              </td>
              <td className="px-3 py-2">{row.daysOutstanding}</td>
              <td className="px-3 py-2">{formatAdminMoney(row.invoicedCents)}</td>
              <td className="px-3 py-2 font-medium text-red-700">
                {formatAdminMoney(row.balanceDueCents)}
              </td>
              <td className="min-w-[11rem] px-3 py-2">
                <DebtSettlementSummary
                  invoiceNumber={row.invoiceNumber}
                  settlementStatus={row.settlementStatus}
                  paymentMethod={row.paymentMethod}
                  paymentMethodRaw={row.paymentMethodRaw}
                  settlementPaidAmountCents={row.settlementPaidAmountCents}
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenClient(row.clientKey)}
                >
                  {tbl.open}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
