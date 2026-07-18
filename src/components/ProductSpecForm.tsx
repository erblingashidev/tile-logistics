"use client";

import { useMemo } from "react";
import { Button, Input, Select } from "@/components/ui";
import {
  derivePackFields,
  generateLotEan,
} from "@/lib/product-pallet-spec";
import { ORDER_UNITS, ORDER_UNIT_LABELS, normalizeOrderUnit } from "@/lib/constants";

export interface ProductFormValues {
  productName: string;
  ean: string;
  unit: string;
  tileWidthCm: string;
  tileHeightCm: string;
  tileThicknessCm: string;
  piecesPerPack: string;
  packsPerPallet: string;
  piecesPerPallet: string;
  m2PerPack: string;
  m2PerPallet: string;
  kgPerPack: string;
  kgPerPallet: string;
  unitWeightKg: string;
  palletFootprintLengthCm: string;
  palletFootprintWidthCm: string;
  replacesStandardPallets: string;
  familyKey: string;
  batchCode: string;
  productionDate: string;
  shipmentRef: string;
  status: string;
}

export function emptyProductForm(): ProductFormValues {
  return {
    productName: "",
    ean: generateLotEan(),
    unit: "m2",
    tileWidthCm: "",
    tileHeightCm: "",
    tileThicknessCm: "",
    piecesPerPack: "",
    packsPerPallet: "",
    piecesPerPallet: "",
    m2PerPack: "",
    m2PerPallet: "",
    kgPerPack: "",
    kgPerPallet: "",
    unitWeightKg: "",
    palletFootprintLengthCm: "120",
    palletFootprintWidthCm: "80",
    replacesStandardPallets: "1",
    familyKey: "",
    batchCode: "",
    productionDate: "",
    shipmentRef: "",
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
  piecesPerPack?: number | null;
  packsPerPallet?: number | null;
  piecesPerPallet: number | null;
  m2PerPack?: number | null;
  m2PerPallet: number | null;
  kgPerPack?: number | null;
  kgPerPallet: number | null;
  unitWeightKg: number | null;
  palletFootprintLengthCm: number | null;
  palletFootprintWidthCm: number | null;
  replacesStandardPallets: number | null;
  familyKey?: string | null;
  batchCode?: string | null;
  productionDate?: string | null;
  shipmentRef?: string | null;
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
    piecesPerPack:
      product.piecesPerPack != null ? String(product.piecesPerPack) : "",
    packsPerPallet:
      product.packsPerPallet != null ? String(product.packsPerPallet) : "",
    piecesPerPallet:
      product.piecesPerPallet != null ? String(product.piecesPerPallet) : "",
    m2PerPack: product.m2PerPack != null ? String(product.m2PerPack) : "",
    m2PerPallet: product.m2PerPallet != null ? String(product.m2PerPallet) : "",
    kgPerPack: product.kgPerPack != null ? String(product.kgPerPack) : "",
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
    familyKey: product.familyKey ?? "",
    batchCode: product.batchCode ?? "",
    productionDate: product.productionDate ?? "",
    shipmentRef: product.shipmentRef ?? "",
    status: product.status,
  };
}

function num(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function formValuesToPayload(form: ProductFormValues) {
  const derived = derivePackFields({
    tileWidthCm: num(form.tileWidthCm),
    tileHeightCm: num(form.tileHeightCm),
    piecesPerPack: num(form.piecesPerPack),
    packsPerPallet: num(form.packsPerPallet),
    piecesPerPallet: num(form.piecesPerPallet),
    m2PerPack: num(form.m2PerPack),
    m2PerPallet: num(form.m2PerPallet),
    kgPerPack: num(form.kgPerPack),
    kgPerPallet: num(form.kgPerPallet),
  });

  return {
    productName: form.productName.trim(),
    ean: form.ean.trim() || undefined,
    unit: form.unit,
    tileWidthCm: num(form.tileWidthCm),
    tileHeightCm: num(form.tileHeightCm),
    tileThicknessCm: num(form.tileThicknessCm),
    piecesPerPack: derived.piecesPerPack ?? num(form.piecesPerPack),
    packsPerPallet: derived.packsPerPallet ?? num(form.packsPerPallet),
    piecesPerPallet: derived.piecesPerPallet ?? num(form.piecesPerPallet),
    m2PerPack: derived.m2PerPack ?? num(form.m2PerPack),
    m2PerPallet: derived.m2PerPallet ?? num(form.m2PerPallet),
    kgPerPack: num(form.kgPerPack),
    kgPerPallet: derived.kgPerPallet ?? num(form.kgPerPallet),
    unitWeightKg: num(form.unitWeightKg),
    palletFootprintLengthCm: num(form.palletFootprintLengthCm),
    palletFootprintWidthCm: num(form.palletFootprintWidthCm),
    replacesStandardPallets: num(form.replacesStandardPallets),
    familyKey: form.familyKey.trim() || undefined,
    batchCode: form.batchCode.trim() || undefined,
    productionDate: form.productionDate.trim() || undefined,
    shipmentRef: form.shipmentRef.trim() || undefined,
    status: form.status === "confirmed" ? "confirmed" : "draft",
    asNewLot: true,
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
      derivePackFields({
        tileWidthCm: num(form.tileWidthCm),
        tileHeightCm: num(form.tileHeightCm),
        piecesPerPack: num(form.piecesPerPack),
        packsPerPallet: num(form.packsPerPallet),
        piecesPerPallet: num(form.piecesPerPallet),
        m2PerPack: num(form.m2PerPack),
        m2PerPallet: num(form.m2PerPallet),
        kgPerPack: num(form.kgPerPack),
        kgPerPallet: num(form.kgPerPallet),
      }),
    [form]
  );

  function applyDerived() {
    setForm({
      ...form,
      piecesPerPallet:
        form.piecesPerPallet ||
        (derived.piecesPerPallet != null ? String(derived.piecesPerPallet) : ""),
      m2PerPack:
        form.m2PerPack ||
        (derived.m2PerPack != null ? String(derived.m2PerPack) : ""),
      m2PerPallet:
        form.m2PerPallet ||
        (derived.m2PerPallet != null ? String(derived.m2PerPallet) : ""),
      kgPerPallet:
        form.kgPerPallet ||
        (derived.kgPerPallet != null ? String(derived.kgPerPallet) : ""),
    });
  }

  return (
    <div className="space-y-3">
      <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        Each shade/batch shipment needs its own barcode (lot code). Same tile
        type with a different production batch must not share one EAN — color
        nuance differs and they cannot be sold as one stock.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Product name"
          value={form.productName}
          onChange={(e) => setForm({ ...form, productName: e.target.value })}
        />
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="Lot barcode / EAN"
              value={form.ean}
              onChange={(e) => setForm({ ...form, ean: e.target.value })}
              hint="Autogenerated lot code is fine"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mb-0.5 shrink-0"
            onClick={() => setForm({ ...form, ean: generateLotEan() })}
          >
            New code
          </Button>
        </div>
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

      <p className="text-xs font-medium text-zinc-700">Shipment / batch</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Batch / shade code"
          value={form.batchCode}
          onChange={(e) => setForm({ ...form, batchCode: e.target.value })}
        />
        <Input
          label="Production date"
          type="date"
          value={form.productionDate}
          onChange={(e) => setForm({ ...form, productionDate: e.target.value })}
        />
        <Input
          label="Shipment / truck ref"
          value={form.shipmentRef}
          onChange={(e) => setForm({ ...form, shipmentRef: e.target.value })}
        />
        <Input
          label="Family key (optional)"
          value={form.familyKey}
          onChange={(e) => setForm({ ...form, familyKey: e.target.value })}
          hint="Groups lots of the same type for cloning"
        />
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
        Pack profile — enter box + pallet; system fills the rest
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          label="Tiles per box"
          type="number"
          value={form.piecesPerPack}
          onChange={(e) =>
            setForm({ ...form, piecesPerPack: e.target.value })
          }
          hint="e.g. 2"
        />
        <Input
          label="Boxes per pallet"
          type="number"
          value={form.packsPerPallet}
          onChange={(e) =>
            setForm({ ...form, packsPerPallet: e.target.value })
          }
          hint="e.g. 36"
        />
        <Input
          label="Tiles per pallet"
          type="number"
          value={form.piecesPerPallet}
          onChange={(e) =>
            setForm({ ...form, piecesPerPallet: e.target.value })
          }
          hint={
            derived.piecesPerPallet && !form.piecesPerPallet
              ? `Auto ${derived.piecesPerPallet} (= boxes × tiles/box)`
              : undefined
          }
        />
        <Input
          label="m² per box"
          type="number"
          step="0.0001"
          value={form.m2PerPack}
          onChange={(e) => setForm({ ...form, m2PerPack: e.target.value })}
          hint={
            derived.m2PerPack && !form.m2PerPack
              ? `Auto ${derived.m2PerPack}`
              : undefined
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
              ? `Auto ${derived.m2PerPallet} (e.g. 51.84)`
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

      <Button type="button" variant="secondary" size="sm" onClick={applyDerived}>
        Fill calculated pack fields
      </Button>

      {(derived.m2PerPiece != null ||
        derived.piecesPerPallet != null ||
        derived.m2PerPallet != null) && (
        <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Calculated:{" "}
          {[
            derived.m2PerPiece != null
              ? `${derived.m2PerPiece} m²/tile`
              : null,
            derived.piecesPerPallet != null
              ? `${derived.piecesPerPallet} tiles/pallet`
              : null,
            derived.packsPerPallet != null
              ? `${derived.packsPerPallet} boxes/pallet`
              : null,
            derived.m2PerPallet != null
              ? `${derived.m2PerPallet} m²/pallet`
              : null,
            derived.kgPerPiece != null
              ? `${derived.kgPerPiece} kg/tile`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

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
          hint="1 = normal, 2 = double slot"
        />
      </div>

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
