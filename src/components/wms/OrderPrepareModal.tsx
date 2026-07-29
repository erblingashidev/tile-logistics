"use client";

import { useEffect, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { formatLocationOption } from "@/lib/warehouse-location-code";

interface PrepareLine {
  orderItemId: number;
  productId: number | null;
  productEan: string | null;
  productName: string | null;
  orderedM2: number;
  stockLocations: Array<{
    locationId: number;
    locationCode: string;
    locationZone: string | null;
    quantityM2: number;
  }>;
}

interface OrderPrepareModalProps {
  orderId: number;
  invoiceNumber: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OrderPrepareModal({
  orderId,
  invoiceNumber,
  open,
  onClose,
  onSuccess,
}: OrderPrepareModalProps) {
  const [lines, setLines] = useState<PrepareLine[]>([]);
  const [pickM2, setPickM2] = useState<Record<number, string>>({});
  const [pickLoc, setPickLoc] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    fetch(`/api/portal/orders/${orderId}/prepare`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setLines(data.lines ?? []);
        const m2: Record<number, string> = {};
        const loc: Record<number, string> = {};
        for (const line of data.lines ?? []) {
          m2[line.orderItemId] = String(line.orderedM2 ?? "");
          if (line.stockLocations?.length === 1) {
            loc[line.orderItemId] = String(line.stockLocations[0].locationId);
          }
        }
        setPickM2(m2);
        setPickLoc(loc);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [open, orderId]);

  if (!open) return null;

  async function submit() {
    setError("");
    const picks = [];
    for (const line of lines) {
      if (!line.productId) continue;
      const qty = Number(pickM2[line.orderItemId]);
      const locationId = Number(pickLoc[line.orderItemId]);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(locationId) || locationId <= 0) {
        setError(`Zgjidhni vendndodhjen për ${line.productName ?? line.productEan}.`);
        return;
      }
      picks.push({
        orderItemId: line.orderItemId,
        productId: line.productId,
        locationId,
        quantityM2: qty,
      });
    }
    if (picks.length === 0) {
      setError("Shtoni të paktën një rresht me m² dhe vendndodhje.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/orders/${orderId}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-4 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Përgatit porosinë</h2>
        <p className="mb-4 text-sm text-zinc-600">{invoiceNumber}</p>

        {loading ? (
          <p className="text-sm text-zinc-500">Duke ngarkuar…</p>
        ) : (
          <div className="space-y-4">
            {lines.map((line) => (
              <div
                key={line.orderItemId}
                className="rounded-lg border border-zinc-200 p-3"
              >
                <p className="font-medium text-zinc-900">
                  {line.productName ?? line.productEan ?? "—"}
                </p>
                <p className="mb-2 text-xs text-zinc-500">
                  Porositur: {formatM2(line.orderedM2)} m²
                  {line.productEan ? ` · ${line.productEan}` : ""}
                </p>
                {!line.productId ? (
                  <p className="text-xs text-amber-700">
                    Produkti nuk është në katalog — regjistrojeni fillimisht.
                  </p>
                ) : line.stockLocations.length === 0 ? (
                  <p className="text-xs text-amber-700">Nuk ka stok për këtë produkt.</p>
                ) : (
                  <>
                    <Input
                      label="m² të marra"
                      type="number"
                      step="0.01"
                      value={pickM2[line.orderItemId] ?? ""}
                      onChange={(e) =>
                        setPickM2({ ...pickM2, [line.orderItemId]: e.target.value })
                      }
                    />
                    <Select
                      label="Nga vendndodhja"
                      className="mt-2"
                      value={pickLoc[line.orderItemId] ?? ""}
                      onChange={(e) =>
                        setPickLoc({ ...pickLoc, [line.orderItemId]: e.target.value })
                      }
                    >
                      <option value="">Zgjidh…</option>
                      {line.stockLocations.map((s) => (
                        <option key={s.locationId} value={s.locationId}>
                          {formatLocationOption(s.locationCode, s.locationZone)} (
                          {formatM2(s.quantityM2)} m²)
                        </option>
                      ))}
                    </Select>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded bg-red-50 px-2 py-1 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Anulo
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={busy || loading}
            onClick={() => void submit()}
          >
            {busy ? "Duke ruajtur…" : "Ruaj & përgatit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
