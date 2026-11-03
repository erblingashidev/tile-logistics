"use client";

import {
  INVOICE_SETTLEMENT_STATUSES,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { settlementLabel } from "@/lib/i18n/finance-labels";
import { pickerChipClass } from "@/components/administration/picker-button-styles";

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
    <div className="space-y-2">
      {label ? (
        <span
          className={`block font-semibold text-zinc-800 ${compact ? "text-xs" : "text-sm"}`}
        >
          {label}
        </span>
      ) : null}
      <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
        {options.map((st) => (
          <button
            key={st.id}
            type="button"
            className={pickerChipClass(value === st.id, compact)}
            onClick={() => onChange(st.id)}
          >
            {settlementLabel(t, st.id)}
          </button>
        ))}
      </div>
    </div>
  );
}
