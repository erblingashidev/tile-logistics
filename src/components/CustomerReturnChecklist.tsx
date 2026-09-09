"use client";

import { formatM2 } from "@/lib/calculations";
import {
  RETURN_CONDITION_LABELS,
  RETURN_CONDITIONS,
  type ReturnCondition,
} from "@/lib/customer-return-conditions";
import type { ReturnableLine } from "@/lib/services/customer-returns";

export type ReturnChecklistRow = {
  checked: boolean;
  quantity: string;
  condition: ReturnCondition;
  notes: string;
};

export type ReturnChecklistState = Record<number, ReturnChecklistRow>;

export function emptyReturnChecklist(lines: ReturnableLine[]): ReturnChecklistState {
  const state: ReturnChecklistState = {};
  for (const line of lines) {
    if (line.returnable <= 0) continue;
    state[line.orderItemId] = {
      checked: false,
      quantity: "",
      condition: "untouched",
      notes: "",
    };
  }
  return state;
}

export function checklistToReturnLines(state: ReturnChecklistState) {
  const lines: Array<{
    orderItemId: number;
    quantity: number;
    condition: ReturnCondition;
    notes?: string;
  }> = [];
  for (const [id, row] of Object.entries(state)) {
    if (!row.checked) continue;
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    lines.push({
      orderItemId: Number(id),
      quantity,
      condition: row.condition,
      notes: row.notes.trim() || undefined,
    });
  }
  return lines;
}

function formatQty(unit: string, qty: number): string {
  if (unit === "m2") return formatM2(qty);
  if (unit === "piece") return String(Math.round(qty));
  return String(Math.round(qty * 10) / 10);
}

export function CustomerReturnChecklist({
  lines,
  state,
  onChange,
}: {
  lines: ReturnableLine[];
  state: ReturnChecklistState;
  onChange: (next: ReturnChecklistState) => void;
}) {
  const openLines = lines.filter((l) => l.returnable > 0);

  if (!openLines.length) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing left to return on this invoice.
      </p>
    );
  }

  function patch(id: number, patch: Partial<ReturnChecklistRow>) {
    const current = state[id] ?? {
      checked: false,
      quantity: "",
      condition: "untouched" as ReturnCondition,
      notes: "",
    };
    onChange({ ...state, [id]: { ...current, ...patch } });
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-zinc-900">Products returned</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Check each product, enter qty in the same unit as the invoice, and
          choose condition (untouched, chipped, or broken).
        </p>
      </div>
      <ul className="space-y-2">
        {openLines.map((line) => {
          const row = state[line.orderItemId] ?? {
            checked: false,
            quantity: "",
            condition: "untouched" as ReturnCondition,
            notes: "",
          };
          const qty = Number(row.quantity);
          const returning =
            row.checked && Number.isFinite(qty) && qty > 0 ? qty : 0;
          const left = Math.max(0, line.returnable - returning);

          return (
            <li
              key={line.orderItemId}
              className={`rounded-lg border p-3 ${
                row.checked
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-emerald-600"
                  checked={row.checked}
                  onChange={(e) =>
                    patch(line.orderItemId, {
                      checked: e.target.checked,
                      quantity: e.target.checked ? row.quantity : "",
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900">
                    {line.productName}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    On invoice: {formatQty(line.unit, line.ordered)}{" "}
                    {line.unitLabel}
                    {line.sent > 0
                      ? ` · delivered: ${formatQty(line.unit, line.sent)}`
                      : ""}
                    {line.alreadyReturned > 0
                      ? ` · already returned: ${formatQty(line.unit, line.alreadyReturned)}`
                      : ""}
                    {" · can return: "}
                    {formatQty(line.unit, line.returnable)} {line.unitLabel}
                  </span>
                </span>
              </label>

              {row.checked ? (
                <div className="mt-3 space-y-2 border-t border-emerald-200/80 pt-3 pl-6">
                  <label className="block text-xs text-zinc-600">
                    Qty returned ({line.unitLabel})
                    <input
                      type="number"
                      min={line.unit === "piece" ? 1 : 0.01}
                      step={line.unit === "piece" ? 1 : 0.01}
                      max={line.returnable}
                      className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                      value={row.quantity}
                      onChange={(e) =>
                        patch(line.orderItemId, { quantity: e.target.value })
                      }
                      placeholder={`max ${formatQty(line.unit, line.returnable)}`}
                    />
                  </label>
                  <label className="block text-xs text-zinc-600">
                    Condition
                    <select
                      className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                      value={row.condition}
                      onChange={(e) =>
                        patch(line.orderItemId, {
                          condition: e.target.value as ReturnCondition,
                        })
                      }
                    >
                      {RETURN_CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {RETURN_CONDITION_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-zinc-600">
                    Notes (optional)
                    <input
                      className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                      value={row.notes}
                      onChange={(e) =>
                        patch(line.orderItemId, { notes: e.target.value })
                      }
                      placeholder="e.g. customer over-ordered"
                    />
                  </label>
                  <p className="text-xs text-zinc-600">
                    Still with customer after this return:{" "}
                    <span className="font-semibold tabular-nums text-zinc-900">
                      {formatQty(line.unit, left)} {line.unitLabel}
                    </span>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
