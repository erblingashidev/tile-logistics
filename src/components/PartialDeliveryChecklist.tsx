"use client";

import { formatM2 } from "@/lib/calculations";
import type { LineShipmentProgress } from "@/lib/shipment-line-progress";
import type { ProofLineInput } from "@/lib/shipment-line-progress";

export type ChecklistLineState = {
  checked: boolean;
  sentFully: boolean;
  quantity: string;
};

export type ChecklistState = Record<number, ChecklistLineState>;

export function emptyChecklistState(
  lines: LineShipmentProgress[]
): ChecklistState {
  const state: ChecklistState = {};
  for (const line of lines) {
    if (line.remaining <= 0) continue;
    state[line.orderItemId] = {
      checked: false,
      sentFully: false,
      quantity: "",
    };
  }
  return state;
}

export function checklistToProofLines(
  state: ChecklistState
): ProofLineInput[] {
  const lines: ProofLineInput[] = [];
  for (const [id, row] of Object.entries(state)) {
    if (!row.checked) continue;
    const orderItemId = Number(id);
    if (row.sentFully) {
      lines.push({ orderItemId, sentFully: true });
      continue;
    }
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    lines.push({ orderItemId, quantity });
  }
  return lines;
}

function formatQty(unit: string, qty: number): string {
  if (unit === "m2") return formatM2(qty);
  if (unit === "piece") return String(Math.round(qty));
  return String(Math.round(qty * 10) / 10);
}

export function PartialDeliveryChecklist({
  lines,
  state,
  onChange,
  labels,
}: {
  lines: LineShipmentProgress[];
  state: ChecklistState;
  onChange: (next: ChecklistState) => void;
  labels?: {
    title?: string;
    hint?: string;
    full?: string;
    qty?: string;
    left?: string;
    ordered?: string;
    remaining?: string;
    alreadySent?: string;
  };
}) {
  const openLines = lines.filter((l) => l.remaining > 0);
  if (openLines.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No product lines left to send on this order.
      </p>
    );
  }

  const title = labels?.title ?? "Products on this trip";
  const hint =
    labels?.hint ??
    "Check each product you are sending. Use Full, or enter a custom qty (m² / bags / pcs).";

  function patch(id: number, patch: Partial<ChecklistLineState>) {
    const current = state[id] ?? {
      checked: false,
      sentFully: false,
      quantity: "",
    };
    onChange({
      ...state,
      [id]: { ...current, ...patch },
    });
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
      </div>
      <ul className="space-y-2">
        {openLines.map((line) => {
          const row = state[line.orderItemId] ?? {
            checked: false,
            sentFully: false,
            quantity: "",
          };
          const customQty = Number(row.quantity);
          const sending = row.checked
            ? row.sentFully
              ? line.remaining
              : Number.isFinite(customQty) && customQty > 0
                ? customQty
                : 0
            : 0;
          const leftBehind = Math.max(0, line.remaining - sending);

          return (
            <li
              key={line.orderItemId}
              className={`rounded-lg border p-3 ${
                row.checked
                  ? "border-orange-300 bg-orange-50/60"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-orange-600"
                  checked={row.checked}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    patch(line.orderItemId, {
                      checked,
                      sentFully: checked ? row.sentFully : false,
                      quantity: checked ? row.quantity : "",
                    });
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-900">
                    {line.productName}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {(labels?.ordered ?? "Ordered")}:{" "}
                    {formatQty(line.unit, line.ordered)} {line.unitLabel}
                    {line.sent > 0
                      ? ` · ${(labels?.alreadySent ?? "already sent")}: ${formatQty(line.unit, line.sent)}`
                      : ""}
                    {" · "}
                    {(labels?.remaining ?? "left")}:{" "}
                    {formatQty(line.unit, line.remaining)} {line.unitLabel}
                  </span>
                </span>
              </label>

              {row.checked ? (
                <div className="mt-3 space-y-2 border-t border-orange-200/80 pt-3 pl-6">
                  <label className="flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-orange-600"
                      checked={row.sentFully}
                      onChange={(e) =>
                        patch(line.orderItemId, {
                          sentFully: e.target.checked,
                          quantity: e.target.checked
                            ? String(line.remaining)
                            : "",
                        })
                      }
                    />
                    {(labels?.full ?? "Send fully")} (
                    {formatQty(line.unit, line.remaining)} {line.unitLabel})
                  </label>
                  {!row.sentFully ? (
                    <label className="block text-xs text-zinc-600">
                      {(labels?.qty ?? "Qty sent now")} ({line.unitLabel})
                      <input
                        type="number"
                        min={line.unit === "piece" ? 1 : 0.01}
                        step={line.unit === "piece" ? 1 : 0.01}
                        max={line.remaining}
                        className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                        value={row.quantity}
                        onChange={(e) =>
                          patch(line.orderItemId, {
                            quantity: e.target.value,
                            sentFully: false,
                          })
                        }
                        placeholder={`max ${formatQty(line.unit, line.remaining)}`}
                      />
                    </label>
                  ) : null}
                  <p className="text-xs text-zinc-600">
                    {(labels?.left ?? "Left behind")}:{" "}
                    <span className="font-semibold tabular-nums text-zinc-900">
                      {formatQty(line.unit, leftBehind)} {line.unitLabel}
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
