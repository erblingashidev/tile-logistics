"use client";

import {
  cashVarianceStatus,
  formatCashVarianceLabel,
} from "@/lib/administration/register-cash";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { Card } from "@/components/ui";
import { format } from "date-fns";

export type ClosedRegisterSession = {
  id: number;
  openedAt: string;
  closedAt: string | null;
  openingFloatCents: number;
  closingCashCountedCents: number | null;
  expectedCashCents: number | null;
  cashVarianceCents: number | null;
  closingNotes: string | null;
};

function varianceTone(
  varianceCents: number | null | undefined
): "emerald" | "amber" | "red" {
  if (varianceCents == null) return "amber";
  const s = cashVarianceStatus(varianceCents);
  if (s === "balanced") return "emerald";
  if (s === "over") return "amber";
  return "red";
}

const toneClasses = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  red: "border-red-200 bg-red-50 text-red-950",
};

export function RegisterClosePreview({
  expectedCashCents,
  countedEuros,
}: {
  expectedCashCents: number | null;
  countedEuros: string;
}) {
  if (expectedCashCents == null) return null;
  const countedCents = Math.round(parseFloat(countedEuros || "0") * 100);
  if (!Number.isFinite(countedCents)) return null;
  const variance = countedCents - expectedCashCents;
  const tone = varianceTone(variance);
  return (
    <Card className={`mt-3 border p-3 text-sm ${toneClasses[tone]}`}>
      <p className="font-medium">End-of-shift cash check</p>
      <ul className="mt-2 space-y-1">
        <li>Expected in drawer: {formatAdminMoney(expectedCashCents)}</li>
        <li>Counted: {formatAdminMoney(countedCents)}</li>
        <li className="font-semibold">
          {formatCashVarianceLabel(variance, formatAdminMoney)}
        </li>
      </ul>
    </Card>
  );
}

export function RegisterOpenExpectedBanner({
  expectedCashCents,
}: {
  expectedCashCents: number | null;
}) {
  if (expectedCashCents == null) return null;
  return (
    <p className="text-sm text-zinc-700">
      Expected cash in drawer now:{" "}
      <span className="font-semibold">{formatAdminMoney(expectedCashCents)}</span>
      <span className="text-zinc-500">
        {" "}
        (opening float + cash payments − cash expenses)
      </span>
    </p>
  );
}

export function ClosedRegisterSessionsTable({
  sessions,
}: {
  sessions: ClosedRegisterSession[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No closed register shifts in this date range.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Closed</th>
            <th className="px-3 py-2">Expected</th>
            <th className="px-3 py-2">Counted</th>
            <th className="px-3 py-2">Result</th>
            <th className="px-3 py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const variance = s.cashVarianceCents ?? 0;
            const tone = varianceTone(s.cashVarianceCents);
            return (
              <tr key={s.id} className="border-b last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">
                  {s.closedAt
                    ? format(new Date(s.closedAt), "PPp")
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {s.expectedCashCents != null
                    ? formatAdminMoney(s.expectedCashCents)
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  {s.closingCashCountedCents != null
                    ? formatAdminMoney(s.closingCashCountedCents)
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
                  >
                    {s.cashVarianceCents != null
                      ? formatCashVarianceLabel(
                          s.cashVarianceCents,
                          formatAdminMoney
                        )
                      : "—"}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-xs truncate text-zinc-600">
                  {s.closingNotes ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
