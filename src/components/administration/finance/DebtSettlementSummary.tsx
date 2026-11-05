"use client";

import Link from "next/link";
import {
  isInvoiceSettlementAssignmentComplete,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { useOrgPath } from "@/components/organization/OrgPathProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { settlementLabel } from "@/lib/i18n/finance-labels";

export function DebtSettlementSummary({
  invoiceNumber,
  settlementStatus,
  paymentMethod,
  paymentMethodRaw,
  settlementPaidAmountCents,
}: {
  invoiceNumber: string;
  settlementStatus: string | null;
  paymentMethod: string | null;
  paymentMethodRaw: string | null;
  settlementPaidAmountCents: number | null;
}) {
  const t = useAppMessages();
  const { orgPath } = useOrgPath();
  const status = (settlementStatus ?? "unknown") as InvoiceSettlementStatus;
  const complete = isInvoiceSettlementAssignmentComplete({
    settlementStatus: status,
    paidAmountCents: settlementPaidAmountCents,
    paymentMethod,
  });

  const assignHref = orgPath(
    `/administration/finance/assignments?q=${encodeURIComponent(invoiceNumber.trim())}`
  );

  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-zinc-800">
        {settlementLabel(t, settlementStatus)}
      </p>
      {paymentMethod ? (
        <p className="text-xs text-zinc-600">
          {t.finance.settlement.registerMethod}: {paymentMethod}
        </p>
      ) : paymentMethodRaw?.trim() ? (
        <p className="text-xs text-zinc-500">
          {t.finance.settlement.prodataMenyra}: {paymentMethodRaw.trim()}
        </p>
      ) : null}
      {!complete ? (
        <Link
          href={assignHref}
          className="inline-block text-xs font-semibold text-blue-700 hover:underline"
        >
          {t.finance.table.assignPaymentStatus}
        </Link>
      ) : null}
    </div>
  );
}
