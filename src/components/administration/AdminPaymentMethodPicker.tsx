"use client";

import {
  ADMIN_PAYMENT_METHODS,
  type AdminPaymentMethod,
} from "@/lib/administration/constants";
import { pickerChipClass } from "@/components/administration/picker-button-styles";

export function AdminPaymentMethodPicker({
  value,
  onChange,
  label,
  allowClear = true,
  clearLabel = "—",
}: {
  value: string;
  onChange: (value: AdminPaymentMethod | "") => void;
  label?: string;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  return (
    <div className="space-y-2">
      {label ? (
        <span className="block text-sm font-semibold text-zinc-800">{label}</span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {allowClear ? (
          <button
            type="button"
            className={pickerChipClass(!value)}
            onClick={() => onChange("")}
          >
            {clearLabel}
          </button>
        ) : null}
        {ADMIN_PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={pickerChipClass(value === m.id)}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
