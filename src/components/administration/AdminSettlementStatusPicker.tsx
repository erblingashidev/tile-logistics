"use client";

import {
  INVOICE_SETTLEMENT_STATUSES,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { settlementLabel } from "@/lib/i18n/finance-labels";

function StatusButton({
  active,
  onClick,
  compact,
  children,
}: {
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border text-left font-medium transition ${
        compact ? "px-2 py-1 text-[10px] leading-tight" : "px-2.5 py-1.5 text-xs"
      } ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AdminSettlementStatusPicker({
  value,
  onChange,
  label,
  compact = false,
  excludeStatuses = [],
}: {
  value: InvoiceSettlementStatus;
  onChange: (status: InvoiceSettlementStatus) => void;
  label?: string;
  compact?: boolean;
  excludeStatuses?: InvoiceSettlementStatus[];
}) {
  const t = useAppMessages();
  const options = INVOICE_SETTLEMENT_STATUSES.filter(
    (st) => !excludeStatuses.includes(st.id)
  );

  return (
    <div className="space-y-1.5">
      {label ? (
        <span
          className={`block font-medium text-zinc-700 ${compact ? "text-[10px]" : "text-xs"}`}
        >
          {label}
        </span>
      ) : null}
      <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
        {options.map((st) => (
          <StatusButton
            key={st.id}
            active={value === st.id}
            compact={compact}
            onClick={() => onChange(st.id)}
          >
            {settlementLabel(t, st.id)}
          </StatusButton>
        ))}
      </div>
    </div>
  );
}
