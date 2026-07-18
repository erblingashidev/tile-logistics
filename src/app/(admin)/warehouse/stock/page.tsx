"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [form, setForm] = useState({
    ean: "",
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

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([
      fetch("/api/warehouse/stock"),
      fetch("/api/warehouse/stock?view=locations"),
    ]);
    setStock(await s.json());
    setLocations(await l.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function receive(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ean: form.ean,
        fullPallets: form.fullPallets || undefined,
        packs: form.packs || undefined,
        loosePieces: form.loosePieces || undefined,
        quantityM2: form.quantityM2 || undefined,
        locationId: Number(form.locationId),
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
    setMsg(
      `${form.movementType === "opening" ? "Opening stock" : "Received"} ${formatM2(data.quantityM2)} m² · ${data.breakdown?.labelSq ?? ""}`
    );
    setForm((f) => ({
      ...f,
      ean: "",
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
    setMsg(`Moved ${formatM2(data.quantityM2)} m² to new bin`);
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
    await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "location",
        code: form.code,
        zone: form.zone,
        label: form.label,
      }),
    });
    setForm((f) => ({ ...f, code: "", zone: "", label: "" }));
    load();
  }

  return (
    <AppShell title="Stock">
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

      {msg && (
        <p className="mb-4 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {msg}
        </p>
      )}

      <Card className="mb-6 p-4">
        <p className="mb-1 font-medium">Receive / opening stock (putaway)</p>
        <p className="mb-3 text-xs text-zinc-500">
          Scan the lot barcode, enter how many pallets (or boxes / m²) arrived,
          and choose the bin. Product pack specs convert pallets → m²
          automatically. Register the lot under Products first if it is new.
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
          <Select
            label="Putaway location"
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            required
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
                {l.zone ? ` · ${l.zone}` : ""}
                {l.label ? ` — ${l.label}` : ""}
              </option>
            ))}
          </Select>
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
            label="Or enter m² directly"
            type="number"
            step="0.01"
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
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
            <Button type="submit" disabled={!form.locationId || !form.ean}>
              Register at location
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-3 font-medium">Move between bins</p>
        <form onSubmit={relocate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Stock line"
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
            label="Full pallets"
            type="number"
            value={move.fullPallets}
            onChange={(e) => setMove({ ...move, fullPallets: e.target.value })}
          />
          <Input
            label="Or m²"
            type="number"
            step="0.01"
            value={move.quantityM2}
            onChange={(e) => setMove({ ...move, quantityM2: e.target.value })}
          />
          <div className="flex items-end">
            <Button
              type="submit"
              variant="secondary"
              disabled={!move.productId || !move.toLocationId}
            >
              Move stock
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mb-6 p-4">
        <p className="mb-3 font-medium">Quick-add location</p>
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

      <Card className="overflow-hidden">
        <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Stock by lot × location
        </div>
        {stock.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No stock yet — register products, then receive into a bin." />
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
                  <th className="px-2 py-2">m²</th>
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
