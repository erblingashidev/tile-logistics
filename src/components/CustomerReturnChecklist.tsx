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
  untouched: string;
  chipped: string;
  broken: string;
  notes: string;
};

export type ReturnChecklistState = Record<number, ReturnChecklistRow>;

export function emptyReturnChecklist(lines: ReturnableLine[]): ReturnChecklistState {
  const state: ReturnChecklistState = {};
  for (const line of lines) {
    if (line.returnable <= 0) continue;
    state[line.orderItemId] = {
      checked: false,
      untouched: "",
      chipped: "",
      broken: "",
      notes: "",
    };
  }
  return state;
}

function parseQty(unit: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (unit === "piece") return Math.round(n);
  if (unit === "m2") return Math.round(n * 100) / 100;
  return Math.round(n * 10) / 10;
}

function rowTotal(unit: string, row: ReturnChecklistRow): number {
  return (
    parseQty(unit, row.untouched) +
    parseQty(unit, row.chipped) +
    parseQty(unit, row.broken)
  );
}

export function checklistToReturnLines(state: ReturnChecklistState, lines: ReturnableLine[]) {
  const unitByItem = new Map(lines.map((l) => [l.orderItemId, l.unit]));
  const result: Array<{
    orderItemId: number;
    quantity: number;
    condition: ReturnCondition;
    notes?: string;
  }> = [];

  for (const [id, row] of Object.entries(state)) {
    if (!row.checked) continue;
    const orderItemId = Number(id);
    const unit = unitByItem.get(orderItemId) ?? "m2";
    const notes = row.notes.trim() || undefined;
    const entries: Array<[ReturnCondition, string]> = [
      ["untouched", row.untouched],
      ["chipped", row.chipped],
      ["broken", row.broken],
    ];
    for (const [condition, raw] of entries) {
      const quantity = parseQty(unit, raw);
      if (quantity <= 0) continue;
      result.push({ orderItemId, quantity, condition, notes });
    }
  }
  return result;
}

export function formatQty(unit: string, qty: number): string {
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
      untouched: "",
      chipped: "",
      broken: "",
      notes: "",
    };
    onChange({ ...state, [id]: { ...current, ...patch } });
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-zinc-900">Products returned</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Check each product and enter how much came back in each condition.
          Total returned is the sum of untouched, chipped, and broken — in the
          same unit as the invoice (m², bags, etc.).
        </p>
      </div>
      <ul className="space-y-2">
        {openLines.map((line) => {
          const row = state[line.orderItemId] ?? {
            checked: false,
            untouched: "",
            chipped: "",
            broken: "",
            notes: "",
          };
          const total = row.checked ? rowTotal(line.unit, row) : 0;
          const left = Math.max(0, line.returnable - total);
          const overLimit = total > line.returnable + 0.001;
          const step = line.unit === "piece" ? 1 : 0.01;

          return (
            <li
              key={line.orderItemId}
              className={`rounded-lg border p-3 ${
                row.checked
                  ? overLimit
                    ? "border-red-300 bg-red-50/40"
                    : "border-emerald-300 bg-emerald-50/50"
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
                      untouched: e.target.checked ? row.untouched : "",
                      chipped: e.target.checked ? row.chipped : "",
                      broken: e.target.checked ? row.broken : "",
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
                <div className="mt-3 space-y-3 border-t border-emerald-200/80 pt-3 pl-6">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {RETURN_CONDITIONS.map((condition) => (
                      <label
                        key={condition}
                        className="block text-xs text-zinc-600"
                      >
                        {RETURN_CONDITION_LABELS[condition]} ({line.unitLabel})
                        <input
                          type="number"
                          min={0}
                          step={step}
                          className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                          value={row[condition]}
                          onChange={(e) =>
                            patch(line.orderItemId, {
                              [condition]: e.target.value,
                            })
                          }
                          placeholder="0"
                        />
                      </label>
                    ))}
                  </div>

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

                  <div className="rounded-md bg-white/80 px-3 py-2 text-xs text-zinc-700 ring-1 ring-zinc-200/80">
                    <p>
                      Total returned:{" "}
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {formatQty(line.unit, total)} {line.unitLabel}
                      </span>
                    </p>
                    {total > 0 ? (
                      <p className="mt-1 text-zinc-600">
                        {parseQty(line.unit, row.untouched) > 0
                          ? `${RETURN_CONDITION_LABELS.untouched}: ${formatQty(line.unit, parseQty(line.unit, row.untouched))}`
                          : null}
                        {parseQty(line.unit, row.chipped) > 0
                          ? `${parseQty(line.unit, row.untouched) > 0 ? " · " : ""}${RETURN_CONDITION_LABELS.chipped}: ${formatQty(line.unit, parseQty(line.unit, row.chipped))}`
                          : null}
                        {parseQty(line.unit, row.broken) > 0
                          ? `${parseQty(line.unit, row.untouched) > 0 || parseQty(line.unit, row.chipped) > 0 ? " · " : ""}${RETURN_CONDITION_LABELS.broken}: ${formatQty(line.unit, parseQty(line.unit, row.broken))}`
                          : null}
                      </p>
                    ) : null}
                    <p className="mt-1">
                      Still with customer after this return:{" "}
                      <span className="font-semibold tabular-nums text-zinc-900">
                        {formatQty(line.unit, left)} {line.unitLabel}
                      </span>
                    </p>
                    {overLimit ? (
                      <p className="mt-1 font-medium text-red-700">
                        Total exceeds what can still be returned (
                        {formatQty(line.unit, line.returnable)} {line.unitLabel}
                        ).
                      </p>
                    ) : null}
                    {total <= 0 ? (
                      <p className="mt-1 text-amber-700">
                        Enter at least one quantity above zero.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
