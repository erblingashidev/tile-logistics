"use client";

import { useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { derivePalletFields } from "@/lib/product-pallet-spec";
import { ORDER_UNITS, ORDER_UNIT_LABELS, normalizeOrderUnit } from "@/lib/constants";

export interface ProductFormValues {
  productName: string;
  ean: string;
  unit: string;
  tileWidthCm: string;
  tileHeightCm: string;
  tileThicknessCm: string;
  piecesPerPallet: string;
  m2PerPallet: string;
  kgPerPallet: string;
  unitWeightKg: string;
  palletFootprintLengthCm: string;
  palletFootprintWidthCm: string;
  replacesStandardPallets: string;
  status: string;
}

export function emptyProductForm(): ProductFormValues {
  return {
    productName: "",
    ean: "",
    unit: "m2",
    tileWidthCm: "",
    tileHeightCm: "",
    tileThicknessCm: "",
    piecesPerPallet: "",
    m2PerPallet: "",
    kgPerPallet: "",
    unitWeightKg: "",
    palletFootprintLengthCm: "120",
    palletFootprintWidthCm: "80",
    replacesStandardPallets: "1",
    status: "draft",
  };
}

export function productToFormValues(product: {
  productName: string | null;
  ean: string | null;
  unit: string;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  tileThicknessCm?: number | null;
  piecesPerPallet: number | null;
  m2PerPallet: number | null;
  kgPerPallet: number | null;
  unitWeightKg: number | null;
  palletFootprintLengthCm: number | null;
  palletFootprintWidthCm: number | null;
  replacesStandardPallets: number | null;
  status: string;
}): ProductFormValues {
  return {
    productName: product.productName ?? "",
    ean: product.ean ?? "",
    unit: normalizeOrderUnit(product.unit),
    tileWidthCm: product.tileWidthCm != null ? String(product.tileWidthCm) : "",
    tileHeightCm: product.tileHeightCm != null ? String(product.tileHeightCm) : "",
    tileThicknessCm:
      product.tileThicknessCm != null ? String(product.tileThicknessCm) : "",
    piecesPerPallet:
      product.piecesPerPallet != null ? String(product.piecesPerPallet) : "",
    m2PerPallet: product.m2PerPallet != null ? String(product.m2PerPallet) : "",
    kgPerPallet: product.kgPerPallet != null ? String(product.kgPerPallet) : "",
    unitWeightKg:
      product.unitWeightKg != null ? String(product.unitWeightKg) : "",
    palletFootprintLengthCm:
      product.palletFootprintLengthCm != null
        ? String(product.palletFootprintLengthCm)
        : "120",
    palletFootprintWidthCm:
      product.palletFootprintWidthCm != null
        ? String(product.palletFootprintWidthCm)
        : "80",
    replacesStandardPallets:
      product.replacesStandardPallets != null
        ? String(product.replacesStandardPallets)
        : "1",
    status: product.status,
  };
}

function num(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formValuesToPayload(form: ProductFormValues) {
  return {
    productName: form.productName.trim(),
    ean: form.ean.trim() || undefined,
    unit: form.unit,
    tileWidthCm: num(form.tileWidthCm),
    tileHeightCm: num(form.tileHeightCm),
    tileThicknessCm: num(form.tileThicknessCm),
    piecesPerPallet: num(form.piecesPerPallet),
    m2PerPallet: num(form.m2PerPallet),
    kgPerPallet: num(form.kgPerPallet),
    unitWeightKg: num(form.unitWeightKg),
    palletFootprintLengthCm: num(form.palletFootprintLengthCm),
    palletFootprintWidthCm: num(form.palletFootprintWidthCm),
    replacesStandardPallets: num(form.replacesStandardPallets),
    status: form.status === "confirmed" ? "confirmed" : "draft",
  };
}

export function ProductSpecForm({
  form,
  setForm,
  onSave,
  onCancel,
  saveLabel = "Save",
}: {
  form: ProductFormValues;
  setForm: (form: ProductFormValues) => void;
  onSave: () => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const derived = useMemo(
    () =>
      derivePalletFields({
        tileWidthCm: num(form.tileWidthCm),
        tileHeightCm: num(form.tileHeightCm),
        piecesPerPallet: num(form.piecesPerPallet),
        m2PerPallet: num(form.m2PerPallet),
        kgPerPallet: num(form.kgPerPallet),
      }),
    [form]
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Product name"
          value={form.productName}
          onChange={(e) => setForm({ ...form, productName: e.target.value })}
        />
        <Input
          label="Barcode / EAN (optional)"
          value={form.ean}
          onChange={(e) => setForm({ ...form, ean: e.target.value })}
        />
        <Select
          label="Unit sold"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        >
          {ORDER_UNITS.map((u) => (
            <option key={u} value={u}>
              {ORDER_UNIT_LABELS[u]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
        </Select>
      </div>

      <p className="text-xs font-medium text-zinc-700">Tile size</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          label="Width (cm)"
          type="number"
          value={form.tileWidthCm}
          onChange={(e) => setForm({ ...form, tileWidthCm: e.target.value })}
        />
        <Input
          label="Length (cm)"
          type="number"
          value={form.tileHeightCm}
          onChange={(e) => setForm({ ...form, tileHeightCm: e.target.value })}
        />
        <Input
          label="Thickness (cm, optional)"
          type="number"
          step="0.1"
          value={form.tileThicknessCm}
          onChange={(e) =>
            setForm({ ...form, tileThicknessCm: e.target.value })
          }
        />
      </div>

      <p className="text-xs font-medium text-zinc-700">
        Pallet profile — used for order weight & truck space
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          label="Pieces per pallet"
          type="number"
          value={form.piecesPerPallet}
          onChange={(e) =>
            setForm({ ...form, piecesPerPallet: e.target.value })
          }
        />
        <Input
          label="m² per pallet"
          type="number"
          step="0.01"
          value={form.m2PerPallet}
          onChange={(e) => setForm({ ...form, m2PerPallet: e.target.value })}
          hint={
            derived.m2PerPallet && !form.m2PerPallet
              ? `Suggested ${derived.m2PerPallet} m² from size × pieces`
              : undefined
          }
        />
        <Input
          label="kg per pallet"
          type="number"
          step="0.1"
          value={form.kgPerPallet}
          onChange={(e) => setForm({ ...form, kgPerPallet: e.target.value })}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          label="Pallet length (cm)"
          type="number"
          value={form.palletFootprintLengthCm}
          onChange={(e) =>
            setForm({ ...form, palletFootprintLengthCm: e.target.value })
          }
        />
        <Input
          label="Pallet width (cm)"
          type="number"
          value={form.palletFootprintWidthCm}
          onChange={(e) =>
            setForm({ ...form, palletFootprintWidthCm: e.target.value })
          }
        />
        <Input
          label="Truck slots per pallet"
          type="number"
          step="0.5"
          value={form.replacesStandardPallets}
          onChange={(e) =>
            setForm({ ...form, replacesStandardPallets: e.target.value })
          }
          hint="1 = normal pallet, 2 = double slot (large tiles)"
        />
      </div>

      {derived.m2PerPiece != null || derived.kgPerPiece != null ? (
        <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Derived:{" "}
          {derived.m2PerPiece != null
            ? `${derived.m2PerPiece} m²/piece`
            : null}
          {derived.m2PerPiece != null && derived.kgPerPiece != null ? " · " : null}
          {derived.kgPerPiece != null ? `${derived.kgPerPiece} kg/piece` : null}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" onClick={onSave}>
          {saveLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
