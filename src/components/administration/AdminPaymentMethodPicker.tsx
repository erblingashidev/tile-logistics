"use client";

import {
  ADMIN_PAYMENT_METHODS,
  type AdminPaymentMethod,
} from "@/lib/administration/constants";

function MethodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
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
    <div className="space-y-1.5">
      {label ? (
        <span className="block text-xs font-medium text-zinc-700">{label}</span>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {allowClear ? (
          <MethodButton active={!value} onClick={() => onChange("")}>
            {clearLabel}
          </MethodButton>
        ) : null}
        {ADMIN_PAYMENT_METHODS.map((m) => (
          <MethodButton
            key={m.id}
            active={value === m.id}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </MethodButton>
        ))}
      </div>
    </div>
  );
}
