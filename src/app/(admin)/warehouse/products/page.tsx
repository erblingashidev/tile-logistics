"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  ProductSpecForm,
  emptyProductForm,
  formValuesToPayload,
  productToFormValues,
  type ProductFormValues,
} from "@/components/ProductSpecForm";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { ORDER_UNIT_LABELS, normalizeOrderUnit } from "@/lib/constants";

interface Product {
  id: number;
  ean: string | null;
  productName: string | null;
  unit: string;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  tileThicknessCm: number | null;
  status: string;
  source: string;
  m2PerPallet: number | null;
  piecesPerPallet: number | null;
  kgPerPallet: number | null;
  piecesPerPack: number | null;
  m2PerPack: number | null;
  kgPerPack: number | null;
  unitWeightKg: number | null;
  palletFootprintLengthCm: number | null;
  palletFootprintWidthCm: number | null;
  replacesStandardPallets: number | null;
}

export default function WarehouseProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<ProductFormValues>(emptyProductForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProductFormValues>(emptyProductForm());

  const load = useCallback(async () => {
    const res = await fetch("/api/warehouse/products");
    setProducts(await res.json());
    setSelected(new Set());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allSelected = products.length > 0 && selected.size === products.length;
  const someSelected = selected.size > 0;
  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  }

  async function saveNewProduct() {
    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formValuesToPayload(addForm)),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Save failed");
        return;
      }
      setShowAdd(false);
      setAddForm(emptyProductForm());
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedProduct() {
    if (!editingId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...formValuesToPayload(editForm) }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Save failed");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirm(id: number) {
    await fetch("/api/warehouse/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function deleteIds(ids: number[], label: string) {
    if (ids.length === 0) return;
    const message =
      ids.length === 1
        ? `Delete this product from the catalog?\n\n${label}\n\nStock records for this product will also be removed.`
        : `Delete ${ids.length} products from the catalog?\n\nStock records for these products will also be removed.`;
    if (!window.confirm(message)) return;

    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids.length === 1 ? { id: ids[0] } : { ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Delete failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  function deleteOne(product: Product) {
    const label = `${product.ean ?? "—"} · ${product.productName ?? "Unnamed"}`;
    deleteIds([product.id], label);
  }

  function deleteSelected() {
    deleteIds(selectedIds, `${selectedIds.length} selected products`);
  }

  return (
    <AppShell
      title="Product catalog"
      description="Pallet specs for weight and capacity."
    >
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>

      <Card className="mb-6 p-4">
        {!showAdd ? (
          <Button onClick={() => setShowAdd(true)}>Add product with pallet specs</Button>
        ) : (
          <>
            <h2 className="mb-3 font-semibold">New product</h2>
            <ProductSpecForm
              form={addForm}
              setForm={setAddForm}
              onSave={saveNewProduct}
              onCancel={() => {
                setShowAdd(false);
                setAddForm(emptyProductForm());
              }}
              saveLabel={busy ? "Saving…" : "Create product"}
            />
          </>
        )}
      </Card>

      {products.length === 0 ? (
        <EmptyState title="No products yet." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-zinc-300"
              />
              Select all ({products.length})
            </label>
            {someSelected && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={deleteSelected}
              >
                Delete selected ({selected.size})
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {products.map((p) => {
              const isSelected = selected.has(p.id);
              const isEditing = editingId === p.id;
              return (
                <Card
                  key={p.id}
                  className={`p-4 ${isSelected ? "border-zinc-400 bg-zinc-50" : ""}`}
                >
                  {isEditing ? (
                    <ProductSpecForm
                      form={editForm}
                      setForm={setEditForm}
                      onSave={saveEditedProduct}
                      onCancel={() => setEditingId(null)}
                      saveLabel={busy ? "Saving…" : "Save specs"}
                    />
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(p.id)}
                          className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300"
                          aria-label={`Select ${p.productName ?? p.ean ?? p.id}`}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-900">
                            {p.productName ?? "Unnamed"}
                          </p>
                          <p className="text-sm text-zinc-600">
                            {p.ean ? `EAN ${p.ean} · ` : ""}
                            {ORDER_UNIT_LABELS[normalizeOrderUnit(p.unit)] ?? p.unit}
                            {p.tileWidthCm && p.tileHeightCm
                              ? ` · ${p.tileWidthCm}×${p.tileHeightCm} cm`
                              : ""}
                          </p>
                          {p.piecesPerPallet && p.m2PerPallet ? (
                            <p className="mt-1 text-sm text-green-800">
                              Pallet: {p.piecesPerPallet} pcs ·{" "}
                              {formatM2(p.m2PerPallet)} m²
                              {p.kgPerPallet ? ` · ${p.kgPerPallet} kg` : ""}
                              {p.palletFootprintLengthCm && p.palletFootprintWidthCm
                                ? ` · ${p.palletFootprintLengthCm}×${p.palletFootprintWidthCm} cm`
                                : ""}
                              {p.replacesStandardPallets != null &&
                              p.replacesStandardPallets !== 1
                                ? ` · ${p.replacesStandardPallets} truck slots`
                                : ""}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-amber-700">
                              No pallet specs — orders will use generic tile standards.
                            </p>
                          )}
                          <p className="mt-1 text-xs text-zinc-500">source: {p.source}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={p.status === "confirmed" ? "green" : "amber"}>
                          {p.status}
                        </Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditingId(p.id);
                            setEditForm(productToFormValues(p));
                          }}
                        >
                          Edit specs
                        </Button>
                        {p.status !== "confirmed" && (
                          <Button variant="secondary" size="sm" onClick={() => confirm(p.id)}>
                            Confirm
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => deleteOne(p)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
