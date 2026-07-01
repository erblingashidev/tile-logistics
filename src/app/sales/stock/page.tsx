"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PortalCard,
  PortalSectionTitle,
} from "@/components/portal/PortalShell";
import { Alert, EmptyState, Input } from "@/components/ui";
import { readJsonListWithError } from "@/lib/api/read-json-list";
import { formatM2 } from "@/lib/calculations";

interface StockRow {
  balanceId: number;
  productId: number;
  ean: string | null;
  productName: string | null;
  locationCode: string;
  locationLabel: string | null;
  quantityM2: number;
  fullPallets: number;
  loosePieces: number;
  status: string;
}

export default function SalesStockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/sales/stock", { cache: "no-store" });
    const payload = await readJsonListWithError<StockRow>(res);
    setStock(payload.data);
    setError(payload.error ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return stock;
    return stock.filter(
      (row) =>
        (row.productName ?? "").toLowerCase().includes(term) ||
        (row.ean ?? "").toLowerCase().includes(term) ||
        row.locationCode.toLowerCase().includes(term)
    );
  }, [search, stock]);

  const totals = useMemo(
    () => ({
      lines: filtered.length,
      m2: filtered.reduce((sum, row) => sum + row.quantityM2, 0),
      pallets: filtered.reduce((sum, row) => sum + row.fullPallets, 0),
    }),
    [filtered]
  );

  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-3 gap-3">
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Products in stock
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{totals.lines}</p>
        </PortalCard>
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Total m²
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">
            {formatM2(totals.m2)}
          </p>
        </PortalCard>
        <PortalCard className="!p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Full pallets
          </p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{totals.pallets}</p>
        </PortalCard>
      </div>

      <PortalCard>
        <Input
          label="Search stock"
          placeholder="Product name, EAN, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </PortalCard>

      <section>
        <PortalSectionTitle className="mb-3">Warehouse stock</PortalSectionTitle>
        {loading ? (
          <PortalCard>
            <p className="text-sm text-zinc-500">Loading stock…</p>
          </PortalCard>
        ) : filtered.length === 0 ? (
          <PortalCard>
            <EmptyState title="No stock lines match your search." />
          </PortalCard>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <PortalCard key={row.balanceId} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">
                      {row.productName || "Unnamed product"}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {row.ean ? `EAN ${row.ean} · ` : ""}
                      {row.locationCode}
                      {row.locationLabel ? ` (${row.locationLabel})` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-zinc-700">
                    <p className="font-semibold">{formatM2(row.quantityM2)} m²</p>
                    <p className="mt-0.5 text-zinc-500">
                      {row.fullPallets} pal · {row.loosePieces} loose
                    </p>
                  </div>
                </div>
              </PortalCard>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
