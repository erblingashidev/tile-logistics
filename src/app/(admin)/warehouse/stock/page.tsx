"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  tableClass,
} from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface Location {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
}

interface StockRow {
  balanceId: number;
  productId: number;
  ean: string | null;
  productName: string | null;
  batchCode: string | null;
  shipmentRef: string | null;
  m2PerPallet: number | null;
  locationId: number;
  locationCode: string;
  locationZone: string | null;
  quantityM2: number;
  fullPallets: number;
  loosePieces: number;
}

export default function WarehouseStockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    ean: "",
    productName: "",
    fullPallets: "",
    packs: "",
    loosePieces: "",
    quantityM2: "",
    locationId: "",
    batchCode: "",
    shipmentRef: "",
    productionDate: "",
    movementType: "receive" as "receive" | "opening",
    code: "",
    zone: "",
    label: "",
  });
  const [move, setMove] = useState({
    productId: "",
    fromLocationId: "",
    toLocationId: "",
    fullPallets: "",
    quantityM2: "",
  });
  const [msg, setMsg] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [s, l] = await Promise.all([
        fetch("/api/warehouse/stock"),
        fetch("/api/warehouse/stock?view=locations"),
      ]);
      const stockJson = await s.json();
      const locJson = await l.json();
      if (!s.ok) {
        setStock([]);
        setLoadError(stockJson.error ?? "Could not load stock");
        return;
      }
      if (!l.ok) {
        setLocations([]);
        setLoadError(locJson.error ?? "Could not load locations");
        return;
      }
      setStock(Array.isArray(stockJson) ? stockJson : []);
      setLocations(Array.isArray(locJson) ? locJson : []);
    } catch {
      setLoadError("Could not load stock — refresh and try again.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasQty =
    Boolean(form.quantityM2) ||
    Boolean(form.fullPallets) ||
    Boolean(form.packs) ||
    Boolean(form.loosePieces);

  const productTotals = useMemo(() => {
    const map = new Map<
      number,
      { ean: string | null; name: string | null; total: number; bins: number }
    >();
    for (const row of stock) {
      const cur = map.get(row.productId);
      if (!cur) {
        map.set(row.productId, {
          ean: row.ean,
          name: row.productName,
          total: row.quantityM2,
          bins: 1,
        });
      } else {
        cur.total += row.quantityM2;
        cur.bins += 1;
      }
    }
    return [...map.values()].filter((r) => r.bins > 1).slice(0, 8);
  }, [stock]);

  async function receive(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!hasQty) {
      setMsg("Enter pallets, boxes, loose tiles, or m².");
      return;
    }
    const res = await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ean: form.ean,
        productName: form.productName || undefined,
        fullPallets: form.fullPallets || undefined,
        packs: form.packs || undefined,
        loosePieces: form.loosePieces || undefined,
        quantityM2: form.quantityM2 || undefined,
        locationId: form.locationId ? Number(form.locationId) : null,
        batchCode: form.batchCode || undefined,
        shipmentRef: form.shipmentRef || undefined,
        productionDate: form.productionDate || undefined,
        movementType: form.movementType,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    const where = data.locationCode ?? "STAGING";
    setMsg(
      `${form.movementType === "opening" ? "Opening stock" : "Received"} ${formatM2(data.quantityM2)} m² at ${where}${
        data.breakdown?.labelSq ? ` · ${data.breakdown.labelSq}` : ""
      }`
    );
    setForm((f) => ({
      ...f,
      ean: "",
      productName: "",
      fullPallets: "",
      packs: "",
      loosePieces: "",
      quantityM2: "",
      batchCode: "",
      shipmentRef: "",
      productionDate: "",
    }));
    load();
  }

  async function relocate(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!move.fullPallets && !move.quantityM2) {
      setMsg("Enter pallets or m² to move.");
      return;
    }
    const res = await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move",
        productId: Number(move.productId),
        fromLocationId: Number(move.fromLocationId),
        toLocationId: Number(move.toLocationId),
        fullPallets: move.fullPallets || undefined,
        quantityM2: move.quantityM2 || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Move failed");
      return;
    }
    setMsg(`Moved ${formatM2(data.quantityM2)} m² to new location`);
    setMove({
      productId: "",
      fromLocationId: "",
      toLocationId: "",
      fullPallets: "",
      quantityM2: "",
    });
    load();
  }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "location",
        code: form.code,
        zone: form.zone,
        label: form.label,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Could not add location");
      return;
    }
    setForm((f) => ({ ...f, code: "", zone: "", label: "" }));
    load();
  }

  async function importProData(file: File | null) {
    if (!file) return;
    setImportBusy(true);
    setMsg("Reading Excel…");

    async function postJson(payload: Record<string, unknown>) {
      const res = await fetch("/api/warehouse/stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: { error?: string; created?: number; written?: number; cleared?: number } =
        {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          res.status === 502 || res.status === 504
            ? `Step timed out (HTTP ${res.status}). Retry — chunks should stay under 10s.`
            : `Step failed (HTTP ${res.status}).`
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Step failed (HTTP ${res.status})`);
      }
      return data;
    }

    try {
      const body = new FormData();
      body.append("file", file);
      const prepRes = await fetch("/api/warehouse/stock/import", {
        method: "POST",
        body,
      });
      const prepText = await prepRes.text();
      let prep: {
        error?: string;
        ok?: boolean;
        products?: Array<Record<string, unknown>>;
        balances?: Array<Record<string, unknown>>;
        locationIds?: number[];
        productCount?: number;
        balanceCount?: number;
        locationCount?: number;
        negativesClamped?: number;
        warnings?: string[];
      } = {};
      try {
        prep = prepText ? JSON.parse(prepText) : {};
      } catch {
        setMsg(
          prepRes.status === 502 || prepRes.status === 504
            ? "Prepare timed out. Retry once — parsing should finish under 10s."
            : `Import failed (HTTP ${prepRes.status}).`
        );
        return;
      }
      if (!prepRes.ok || !prep.ok || !prep.products || !prep.balances) {
        setMsg(prep.error ?? `Import failed (HTTP ${prepRes.status})`);
        return;
      }

      const products = prep.products;
      const balances = prep.balances;
      const locationIds = prep.locationIds ?? [];
      let productsCreated = 0;
      const productChunk = 100;
      for (let i = 0; i < products.length; i += productChunk) {
        setMsg(
          `Products ${Math.min(i + productChunk, products.length)}/${products.length}…`
        );
        const data = await postJson({
          action: "products",
          products: products.slice(i, i + productChunk),
        });
        productsCreated += data.created ?? 0;
      }

      setMsg("Clearing previous Pro-Data stock…");
      const cleared = await postJson({
        action: "clear",
        locationIds,
      });

      let balancesWritten = 0;
      const balanceChunk = 150;
      for (let i = 0; i < balances.length; i += balanceChunk) {
        setMsg(
          `Balances ${Math.min(i + balanceChunk, balances.length)}/${balances.length}…`
        );
        const data = await postJson({
          action: "balances",
          balances: balances.slice(i, i + balanceChunk),
        });
        balancesWritten += data.written ?? 0;
      }

      await postJson({
        action: "finish",
        locationIds,
        productsCreated,
        balancesWritten,
        balancesCleared: cleared.cleared ?? 0,
        balanceCount: prep.balanceCount ?? balances.length,
        productCount: prep.productCount ?? products.length,
        negativesClamped: prep.negativesClamped ?? 0,
        warnings: prep.warnings ?? [],
        sampleEan: (balances[0] as { ean?: string } | undefined)?.ean,
      });

      setMsg(
        `Pro-Data import complete: ${balancesWritten} balances · ${productsCreated} new products · ${prep.locationCount ?? locationIds.length} locations` +
          (cleared.cleared
            ? ` · replaced ${cleared.cleared} previous Pro-Data lines`
            : "")
      );
      load();
    } catch (err) {
      setMsg(
        err instanceof Error
          ? `Import failed: ${err.message}`
          : "Import failed — network error. Check connection and try again."
      );
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <AppShell title="Stock — receive & putaway">
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>
      <Link
        href="/warehouse/products"
        className="mb-4 ml-4 inline-block text-sm text-zinc-500"
      >
        Product lots →
      </Link>
      <Link
        href="/warehouse/locations"
        className="mb-4 ml-4 inline-block text-sm text-zinc-500"
      >
        Locations →
      </Link>

      {(msg || loadError) && (
        <p
          className={`mb-4 rounded border px-3 py-2 text-sm ${
            loadError
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-zinc-200 bg-zinc-50 text-zinc-700"
          }`}
        >
          {loadError || msg}
        </p>
      )}

      <Card className="mb-6 p-4">
        <p className="mb-1 font-medium">Pro-Data stock Excel (every ~2 days)</p>
        <p className="mb-3 text-xs text-zinc-500">
          Upload the Finance+ stock export (Barkodi, Emertimi, Lokacioni, Sasia).
          Large files run in short steps so Netlify does not time out — keep this
          tab open until you see “complete”.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void importProData(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={importBusy}
          onClick={() => fileRef.current?.click()}
        >
          {importBusy ? "Importing…" : "Import Pro-Data .xlsx"}
        </Button>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-1 font-medium">1. Truck unload / opening stock</p>
        <p className="mb-3 text-xs text-zinc-500">
          Location is optional — leave empty to park stock in STAGING, then
          putaway below. Prefer m² if pack specs are not set yet; or register
          the lot under Products first and enter pallets.
        </p>
        <form onSubmit={receive} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Type"
            value={form.movementType}
            onChange={(e) =>
              setForm({
                ...form,
                movementType: e.target.value as "receive" | "opening",
              })
            }
          >
            <option value="receive">Truck unload</option>
            <option value="opening">Opening stock (first registration)</option>
          </Select>
          <Input
            label="Lot barcode / EAN"
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            required
          />
          <Input
            label="Product name (new lots)"
            value={form.productName}
            onChange={(e) => setForm({ ...form, productName: e.target.value })}
          />
          <Select
            label="Location (optional)"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          >
            <option value="">STAGING — put away later</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
                {l.zone ? ` · ${l.zone}` : ""}
                {l.label ? ` — ${l.label}` : ""}
              </option>
            ))}
          </Select>
          <Input
            label="m² (recommended)"
            type="number"
            step="0.01"
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
          />
          <Input
            label="Full pallets"
            type="number"
            min={0}
            value={form.fullPallets}
            onChange={(e) => setForm({ ...form, fullPallets: e.target.value })}
          />
          <Input
            label="Extra boxes"
            type="number"
            min={0}
            value={form.packs}
            onChange={(e) => setForm({ ...form, packs: e.target.value })}
          />
          <Input
            label="Loose tiles"
            type="number"
            min={0}
            value={form.loosePieces}
            onChange={(e) => setForm({ ...form, loosePieces: e.target.value })}
          />
          <Input
            label="Batch / shade"
            value={form.batchCode}
            onChange={(e) => setForm({ ...form, batchCode: e.target.value })}
          />
          <Input
            label="Shipment ref"
            value={form.shipmentRef}
            onChange={(e) => setForm({ ...form, shipmentRef: e.target.value })}
          />
          <Input
            label="Production date"
            type="date"
            value={form.productionDate}
            onChange={(e) =>
              setForm({ ...form, productionDate: e.target.value })
            }
          />
          <div className="flex items-end">
            <Button type="submit" disabled={!form.ean || !hasQty}>
              Register stock
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-1 font-medium">2. Putaway — move between locations</p>
        <p className="mb-3 text-xs text-zinc-500">
          Move from STAGING (or any bin) into another place. The same lot can
          hold stock in multiple locations with separate m² totals.
        </p>
        <form onSubmit={relocate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Stock line (lot × location)"
            value={
              move.productId && move.fromLocationId
                ? `${move.productId}:${move.fromLocationId}`
                : ""
            }
            onChange={(e) => {
              const [productId, fromLocationId] = e.target.value.split(":");
              setMove({ ...move, productId, fromLocationId });
            }}
          >
            <option value="">Select stock to move</option>
            {stock.map((row) => (
              <option
                key={row.balanceId}
                value={`${row.productId}:${row.locationId}`}
              >
                {row.ean ?? "—"} · {row.locationCode} ·{" "}
                {formatM2(row.quantityM2)} m²
              </option>
            ))}
          </Select>
          <Select
            label="To location"
            value={move.toLocationId}
            onChange={(e) =>
              setMove({ ...move, toLocationId: e.target.value })
            }
          >
            <option value="">Select destination</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
                {l.zone ? ` · ${l.zone}` : ""}
              </option>
            ))}
          </Select>
          <Input
            label="m² to move"
            type="number"
            step="0.01"
            value={move.quantityM2}
            onChange={(e) => setMove({ ...move, quantityM2: e.target.value })}
          />
          <Input
            label="Or full pallets"
            type="number"
            value={move.fullPallets}
            onChange={(e) => setMove({ ...move, fullPallets: e.target.value })}
          />
          <div className="flex items-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={!move.productId || !move.toLocationId}
            >
              Putaway / move
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-3 font-medium">Quick-add bin location</p>
        <form onSubmit={addLocation} className="flex flex-wrap gap-2">
          <Input
            placeholder="Code e.g. A-01"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            placeholder="Zone"
            value={form.zone}
            onChange={(e) => setForm({ ...form, zone: e.target.value })}
          />
          <Input
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <Button type="submit">Add location</Button>
        </form>
      </Card>

      {productTotals.length > 0 && (
        <Card className="mb-6 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-800">
            Same product in multiple places
          </p>
          <ul className="space-y-1 text-sm text-zinc-600">
            {productTotals.map((p) => (
              <li key={p.ean ?? p.name ?? String(p.total)}>
                <span className="font-mono text-xs">{p.ean ?? "—"}</span>
                {" · "}
                {p.name ?? "—"}
                {" — "}
                <strong>{formatM2(p.total)} m²</strong> across {p.bins} locations
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Stock by lot × location (m² per place)
        </div>
        {stock.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No stock yet — unload a truck, import Pro-Data, or register opening stock." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-2 py-2">Lot / EAN</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Batch</th>
                  <th className="px-2 py-2">Location</th>
                  <th className="px-2 py-2">m² here</th>
                  <th className="px-2 py-2">Pallets</th>
                  <th className="px-2 py-2">Loose</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((row) => (
                  <tr key={row.balanceId} className="border-b">
                    <td className="px-2 py-2 font-mono text-xs">
                      {row.ean ?? "—"}
                    </td>
                    <td className="px-2 py-2">{row.productName ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">
                      {row.batchCode || row.shipmentRef || "—"}
                    </td>
                    <td className="px-2 py-2">
                      {row.locationCode}
                      {row.locationZone ? (
                        <span className="block text-xs text-zinc-500">
                          {row.locationZone}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{formatM2(row.quantityM2)}</td>
                    <td className="px-2 py-2">{row.fullPallets}</td>
                    <td className="px-2 py-2">{row.loosePieces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
