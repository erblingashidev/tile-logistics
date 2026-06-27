"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";

interface Product {
  id: number;
  ean: string | null;
  productName: string | null;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  status: string;
  source: string;
  m2PerPallet: number | null;
  piecesPerPallet: number | null;
}

export default function WarehouseProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/warehouse/products");
    setProducts(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirm(id: number) {
    await fetch("/api/warehouse/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <AppShell title="Product catalog">
      <p className="mb-4 text-sm text-zinc-600">
        Draft = auto-learned from orders/receiving. Confirm when dimensions look correct.
      </p>
      {products.length === 0 ? (
        <EmptyState title="No products yet — import an order or receive stock." />
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium text-zinc-900">
                  {p.ean ?? "—"} · {p.productName ?? "Unnamed"}
                </p>
                <p className="text-sm text-zinc-600">
                  {p.tileWidthCm && p.tileHeightCm
                    ? `${p.tileWidthCm}×${p.tileHeightCm} cm`
                    : "Size unknown"}
                  {p.piecesPerPallet ? ` · ${p.piecesPerPallet} pcs/pallet` : ""}
                  {" · "}
                  source: {p.source}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={p.status === "confirmed" ? "green" : "amber"}>
                  {p.status}
                </Badge>
                {p.status !== "confirmed" && (
                  <Button variant="secondary" onClick={() => confirm(p.id)}>
                    Confirm
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
