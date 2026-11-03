"use client";

import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { InlineInvoiceSettlementForm } from "@/components/administration/finance/InlineInvoiceSettlementForm";
import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";
import { Button, Card, EmptyState } from "@/components/ui";

export function OpenDebtsTable({
  rows,
  onOpenClient,
  onSettlementSaved,
}: {
  rows: DebtInvoiceLine[];
  onOpenClient: (clientKey: string) => void;
  onSettlementSaved?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="No open debts match these filters." />
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Order date</th>
            <th className="px-3 py-2">Days</th>
            <th className="px-3 py-2">Invoiced</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">MENYRA E PAGESES</th>
            <th className="px-3 py-2 text-right">Client card</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.invoiceNumber}-${row.clientKey}`} className="border-t">
              <td className="px-3 py-2">{row.salesAgentName}</td>
              <td className="px-3 py-2 font-medium">{row.displayName}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.invoiceNumber}</td>
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
                <InlineInvoiceSettlementForm
                  invoiceNumber={row.invoiceNumber}
                  settlementStatus={row.settlementStatus}
                  paymentMethodRaw={row.paymentMethodRaw}
                  onSaved={onSettlementSaved}
                  compact
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenClient(row.clientKey)}
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
