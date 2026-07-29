"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input, Select } from "@/components/ui";
import { WarehouseNav } from "@/components/warehouse/WarehouseNav";
import { formatM2 } from "@/lib/calculations";

export default function WarehouseUnloadPage() {
  const [form, setForm] = useState({
    ean: "",
    productName: "",
    quantityM2: "",
    movementType: "receive" as "receive" | "opening",
  });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    await fetch("/api/warehouse/stock?view=locations");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function receive(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/warehouse/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ean: form.ean,
        productName: form.productName || undefined,
        quantityM2: form.quantityM2 || undefined,
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
      `${form.movementType === "opening" ? "Opening stock" : "Received"} ${formatM2(data.quantityM2)} m² at ${where}`
    );
    setForm((f) => ({ ...f, ean: "", productName: "", quantityM2: "" }));
  }

  return (
    <AppShell
      title="Unloading"
      description="Scan lot barcode and register m² at STAGING"
    >
      <WarehouseNav />

      {msg ? (
        <p className="mb-4 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {msg}
        </p>
      ) : null}

      <Card className="max-w-2xl p-4">
        <p className="mb-3 text-sm text-zinc-600">
          When the truck arrives, scan each lot and enter how many m² were
          unloaded. Stock goes to <strong>STAGING</strong> until mapped to an
          outdoor row on the Mapping page.
        </p>
        <form onSubmit={receive} className="grid gap-3 sm:grid-cols-2">
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
          <Input
            label="m²"
            type="number"
            step="0.01"
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
            required
          />
          <div className="flex items-end sm:col-span-2">
            <Button type="submit" disabled={!form.ean || !form.quantityM2}>
              Register at STAGING
            </Button>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
