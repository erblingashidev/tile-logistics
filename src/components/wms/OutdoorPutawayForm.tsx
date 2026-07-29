"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { formatLocationOption } from "@/lib/warehouse-location-code";

interface ProductHit {
  id: number;
  ean: string | null;
  productName: string | null;
}

interface StockLocation {
  locationId: number;
  locationCode: string;
  locationZone: string | null;
  quantityM2: number;
}

interface OutdoorPutawayFormProps {
  locations: Array<{
    id: number;
    code: string;
    zone: string | null;
    label: string | null;
  }>;
  /** When set, only show locations in this sector (zone), e.g. Depo 3 */
  zoneFilter?: string | null;
  apiBase?: string;
  submitLabel: string;
  onSubmit: (payload: {
    productId: number;
    locationId: number;
    quantityM2: number;
  }) => Promise<void>;
}

export function OutdoorPutawayForm({
  locations,
  zoneFilter,
  apiBase = "/api/wms",
  submitLabel,
  onSubmit,
}: OutdoorPutawayFormProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
  const [locationId, setLocationId] = useState("");
  const [quantityM2, setQuantityM2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filteredLocations = locations.filter(
    (l) => !zoneFilter || l.zone === zoneFilter
  );

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${apiBase}?productSearch=${encodeURIComponent(q.trim())}`
      );
      setResults(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    const t = window.setTimeout(() => void runSearch(query), 250);
    return () => window.clearTimeout(t);
  }, [query, runSearch]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function loadStockLocations(productId: number) {
    const res = await fetch(`${apiBase}?productId=${productId}`);
    if (!res.ok) {
      setStockLocations([]);
      return;
    }
    setStockLocations(await res.json());
  }

  async function selectProduct(p: ProductHit) {
    setProduct(p);
    setQuery(p.productName ?? p.ean ?? "");
    setOpen(false);
    setLocationId("");
    await loadStockLocations(p.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!product) {
      setMsg("Zgjidhni produktin.");
      return;
    }
    const locId = Number(locationId);
    const qty = Number(quantityM2);
    if (!Number.isFinite(locId) || locId <= 0) {
      setMsg("Zgjidhni vendndodhjen (p.sh. D3-K1M).");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setMsg("Shkruani m².");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ productId: product.id, locationId: locId, quantityM2: qty });
      setProduct(null);
      setQuery("");
      setLocationId("");
      setQuantityM2("");
      setStockLocations([]);
      setMsg("U ruajt.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Gabim.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div ref={rootRef} className="relative">
        <Input
          label="Produkti (emër ose barkod)"
          value={query}
          placeholder="Kërko…"
          onChange={(e) => {
            setQuery(e.target.value);
            setProduct(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (loading || results.length > 0 || query.trim().length >= 2) && (
          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
            {loading ? (
              <p className="px-3 py-2 text-sm text-zinc-500">Duke kërkuar…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">Nuk u gjet.</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void selectProduct(p)}
                >
                  <span className="block text-sm font-medium">
                    {p.productName ?? "—"}
                  </span>
                  <span className="block text-xs text-zinc-500">{p.ean}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {product && stockLocations.length > 0 ? (
        <p className="text-xs text-zinc-600">
          Në stok:{" "}
          {stockLocations
            .map(
              (s) =>
                `${formatLocationOption(s.locationCode, s.locationZone)} (${formatM2(s.quantityM2)} m²)`
            )
            .join(" · ")}
        </p>
      ) : null}

      <Select
        label="Vendndodhja (sektor / rresht)"
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        required
      >
        <option value="">Zgjidh…</option>
        {filteredLocations.map((l) => (
          <option key={l.id} value={l.id}>
            {formatLocationOption(l.code, l.zone)}
          </option>
        ))}
      </Select>

      <Input
        label="m²"
        type="number"
        step="0.01"
        min="0"
        value={quantityM2}
        onChange={(e) => setQuantityM2(e.target.value)}
        required
      />

      {msg ? <p className="text-sm text-zinc-700">{msg}</p> : null}

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Duke ruajtur…" : submitLabel}
      </Button>
    </form>
  );
}
