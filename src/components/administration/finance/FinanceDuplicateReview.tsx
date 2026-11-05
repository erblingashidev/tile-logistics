"use client";

import { useCallback, useEffect, useState } from "react";
import type { InvoiceNumberConflict } from "@/lib/administration/prodata-invoice-conflicts";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { useFinanceBusinessDay } from "@/components/administration/finance/FinanceSearchProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Card, LoadingState } from "@/components/ui";

export function FinanceDuplicateReview({
  conflicts: inlineConflicts,
}: {
  conflicts?: InvoiceNumberConflict[];
}) {
  const t = useAppMessages();
  const d = t.finance.duplicates;
  const { businessDay } = useFinanceBusinessDay();
  const [loading, setLoading] = useState(!inlineConflicts);
  const [rows, setRows] = useState<InvoiceNumberConflict[]>(
    inlineConflicts ?? []
  );

  const load = useCallback(async () => {
    if (inlineConflicts) {
      setRows(inlineConflicts);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/administration/finance/invoice-conflicts?day=${encodeURIComponent(businessDay)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        conflicts?: InvoiceNumberConflict[];
      };
      setRows(data.conflicts ?? []);
    } finally {
      setLoading(false);
    }
  }, [inlineConflicts, businessDay]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="mt-8 p-4">
        <LoadingState title={d.loading} />
      </Card>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card className="mt-8 overflow-x-auto p-0">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
        <h2 className="text-base font-semibold text-amber-950">{d.title}</h2>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">{d.invoice}</th>
            <th className="px-3 py-2">{d.source}</th>
            <th className="px-3 py-2">{d.date}</th>
            <th className="px-3 py-2">{d.client}</th>
            <th className="px-3 py-2">{d.amount}</th>
            <th className="px-3 py-2">{d.menyra}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((conflict, groupIndex) =>
            conflict.variants.map((v, i) => (
              <tr
                key={`${conflict.invoiceNumber}-${i}-${v.source}`}
                className={
                  groupIndex > 0 && i === 0
                    ? "border-t-4 border-amber-200"
                    : "border-t border-zinc-100"
                }
              >
                <td className="px-3 py-2 font-mono font-medium">
                  {i === 0 ? conflict.invoiceNumber : ""}
                </td>
                <td className="px-3 py-2 text-xs text-zinc-600">{v.source}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {v.transactionDate?.slice(0, 10) ?? "—"}
                </td>
                <td className="px-3 py-2">{v.buyerName ?? "—"}</td>
                <td className="px-3 py-2">
                  {v.netValueCents != null
                    ? formatAdminMoney(v.netValueCents)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs">{v.paymentMethodRaw ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
