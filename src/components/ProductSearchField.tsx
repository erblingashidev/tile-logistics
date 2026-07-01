"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { ORDER_UNIT_LABELS, normalizeOrderUnit } from "@/lib/constants";
import type { ProductRecord } from "@/lib/services/products";

export interface ProductLineSelection {
  productId?: number;
  productEan?: string;
  productName: string;
  catalogStatus?: string;
}

interface ProductSearchFieldProps {
  productName: string;
  productEan?: string;
  productId?: number;
  catalogStatus?: string;
  onSelect: (product: ProductRecord) => void;
  onDraftChange: (draft: ProductLineSelection) => void;
}

function productSummary(product: ProductRecord): string {
  const unit = normalizeOrderUnit(product.unit);
  const parts: string[] = [];
  if (product.ean) parts.push(product.ean);
  if (product.tileWidthCm && product.tileHeightCm) {
    parts.push(`${product.tileWidthCm}×${product.tileHeightCm} cm`);
  }
  if (product.m2PerPallet != null) parts.push(`${formatM2(product.m2PerPallet)} m²/pallet`);
  if (product.piecesPerPallet != null) parts.push(`${product.piecesPerPallet} pcs/pallet`);
  if (product.unitWeightKg != null) parts.push(`${product.unitWeightKg} kg/pack`);
  parts.push(ORDER_UNIT_LABELS[unit] ?? unit);
  if (product.status === "confirmed") parts.push("confirmed");
  return parts.join(" · ");
}

export function ProductSearchField({
  productName,
  productEan,
  productId,
  catalogStatus,
  onSelect,
  onDraftChange,
}: ProductSearchFieldProps) {
  const [query, setQuery] = useState(productName);
  const [eanQuery, setEanQuery] = useState(productEan ?? "");
  const [results, setResults] = useState<ProductRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(productName);
  }, [productName]);

  useEffect(() => {
    setEanQuery(productEan ?? "");
  }, [productEan]);

  const runSearch = useCallback(async (name: string, ean: string) => {
    const q = ean.trim() || name.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/warehouse/products?q=${encodeURIComponent(q)}&limit=10`
      );
      if (!res.ok) {
        setResults([]);
        return;
      }
      setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(query, eanQuery);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, eanQuery, runSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function applyDraft(name: string, ean: string, id?: number, status?: string) {
    onDraftChange({
      productId: id,
      productEan: ean || undefined,
      productName: name,
      catalogStatus: status,
    });
  }

  return (
    <div ref={rootRef} className="relative space-y-2 sm:col-span-2 lg:col-span-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Barcode / EAN"
          value={eanQuery}
          placeholder="Scan or type code"
          onChange={(e) => {
            const ean = e.target.value;
            setEanQuery(ean);
            applyDraft(query, ean, undefined, undefined);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <Input
          label="Product name"
          value={query}
          placeholder="Start typing to search catalog"
          onChange={(e) => {
            const name = e.target.value;
            setQuery(name);
            applyDraft(name, eanQuery, undefined, undefined);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {productId ? (
        <p className="text-xs text-green-700">
          Linked to catalog #{productId}
          {catalogStatus ? ` (${catalogStatus})` : ""}
        </p>
      ) : query.trim().length >= 2 ? (
        <p className="text-xs text-amber-700">
          New product — saved to catalog when the order is saved.
        </p>
      ) : null}

      {open && (loading || results.length > 0 || query.trim().length >= 2) && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-zinc-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">
              No match — this will register as a new draft product.
            </p>
          ) : (
            results.map((product) => (
              <button
                key={product.id}
                type="button"
                className="block w-full border-b border-zinc-100 px-3 py-2 text-left hover:bg-zinc-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(product.productName ?? "");
                  setEanQuery(product.ean ?? "");
                  setOpen(false);
                  onSelect(product);
                }}
              >
                <span className="block text-sm font-medium text-zinc-900">
                  {product.productName ?? "Unnamed product"}
                </span>
                <span className="block text-xs text-zinc-500">{productSummary(product)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
