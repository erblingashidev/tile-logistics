"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface Location {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
}

interface StockRow {
  ean: string | null;
  productName: string | null;
  locationCode: string;
  quantityM2: number;
  fullPallets: number;
  loosePieces: number;
}

export default function WarehouseStockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState({
    ean: "",
    quantityM2: "",
    locationId: "",
    code: "",
    zone: "",
    label: "",
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
        quantityM2: Number(form.quantityM2),
        locationId: Number(form.locationId),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Failed");
      return;
    }
    setMsg(`Received ${formatM2(Number(form.quantityM2))} m²`);
    setForm((f) => ({ ...f, ean: "", quantityM2: "" }));
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
    <AppShell title="Stock" description="Balances by product and location.">
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>
      <Link
        href="/warehouse/locations"
        className="mb-4 ml-4 inline-block text-sm text-zinc-500"
      >
        Manage locations →
      </Link>

      <Card className="mb-6 p-4">
        <p className="mb-1 font-medium">New warehouse location</p>
        <p className="mb-3 text-sm text-zinc-500">
          Prefer adding locations on the{" "}
          <Link href="/warehouse/locations" className="underline">
            locations page
          </Link>
          .
        </p>
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

      <Card className="mb-6 p-4">
        <p className="mb-3 font-medium">Receive inbound (unload truck)</p>
        <form onSubmit={receive} className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="EAN / barcode"
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
          />
          <Input
            type="number"
            step="0.01"
            placeholder="m² arrived"
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
          />
          <Select
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          >
            <option value="">Select location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.label ? `— ${l.label}` : ""}
              </option>
            ))}
          </Select>
          <Button type="submit" disabled={!form.locationId}>
            Register stock
          </Button>
        </form>
        {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </Card>

      <h2 className="mb-2 font-semibold">Current stock</h2>
      {stock.length === 0 ? (
        <EmptyState title="No stock recorded yet." />
      ) : (
        <div className="space-y-2">
          {stock.map((row) => (
            <Card key={`${row.ean}-${row.locationCode}`} className="p-4 text-sm">
              <p className="font-medium">
                {row.ean} · {row.productName ?? "—"}
              </p>
              <p className="text-zinc-600">
                {row.locationCode}: {formatM2(row.quantityM2)} m² ·{" "}
                {row.fullPallets} paleta · {row.loosePieces} pllaka
              </p>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
