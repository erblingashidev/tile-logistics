"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, StatCard, tableClass } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface Location {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
  notes: string | null;
}

interface StockRow {
  balanceId: number;
  productId: number;
  ean: string | null;
  productName: string | null;
  quantityM2: number;
  fullPallets: number;
  loosePieces: number;
  status: string;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
}

export default function WarehouseLocationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [location, setLocation] = useState<Location | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [form, setForm] = useState({ code: "", zone: "", label: "", notes: "" });
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/warehouse/locations/${id}`);
    if (!res.ok) {
      setError(res.status === 404 ? "Location not found." : "Could not load location.");
      return;
    }
    const data = await res.json();
    setLocation(data.location);
    setStock(data.stock);
    setForm({
      code: data.location.code,
      zone: data.location.zone ?? "",
      label: data.location.label ?? "",
      notes: data.location.notes ?? "",
    });
    setError("");
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setBusy(true);

    try {
      const res = await fetch(`/api/warehouse/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }

      setMsg("Location updated");
      if (data.id !== Number(id)) {
        router.replace(`/warehouse/locations/${data.id}`);
      } else {
        setLocation(data);
        setForm({
          code: data.code,
          zone: data.zone ?? "",
          label: data.label ?? "",
          notes: data.notes ?? "",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const stockNote =
      stock.length > 0
        ? `\n\nThis will also remove ${stock.length} stock line(s) at this bin.`
        : "";
    if (
      !window.confirm(
        `Delete location ${location?.code}?${stockNote}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/locations/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Delete failed");
        return;
      }
      router.push("/warehouse/locations");
    } finally {
      setBusy(false);
    }
  }

  const totalM2 = stock.reduce((sum, row) => sum + row.quantityM2, 0);
  const totalPallets = stock.reduce((sum, row) => sum + row.fullPallets, 0);
  const totalLoose = stock.reduce((sum, row) => sum + row.loosePieces, 0);

  return (
    <AppShell
      title={location ? `Location ${location.code}` : "Location"}
      description={
        location
          ? [location.zone, location.label].filter(Boolean).join(" · ") ||
            "Stock at this bin"
          : "Loading…"
      }
    >
      <Link href="/warehouse/locations" className="mb-4 inline-block text-sm text-zinc-500">
        ← All locations
      </Link>

      {error && !location ? (
        <EmptyState title={error} />
      ) : !location ? (
        <EmptyState title="Loading…" />
      ) : (
        <>
          <Card className="mb-6 p-4">
            <p className="mb-3 font-medium">Edit location</p>
            <form onSubmit={save} className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Code"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  required
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
              </div>
              <Input
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy}
                  onClick={remove}
                >
                  Delete location
                </Button>
              </div>
            </form>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            {msg && !error && <p className="mt-2 text-sm text-green-700">{msg}</p>}
          </Card>

          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <StatCard label="Products" value={stock.length} />
            <StatCard label="Total m²" value={formatM2(totalM2)} />
            <StatCard label="Full pallets" value={totalPallets} />
            <StatCard label="Loose pieces" value={totalLoose} />
          </div>

          <h2 className="mb-2 font-semibold">Stock at {location.code}</h2>
          {stock.length === 0 ? (
            <EmptyState title="Nothing stored here yet." />
          ) : (
            <Card className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>EAN</th>
                    <th>Product</th>
                    <th>Size</th>
                    <th>m²</th>
                    <th>Pallets</th>
                    <th>Loose</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((row) => (
                    <tr key={row.balanceId}>
                      <td className="font-medium">{row.ean ?? "—"}</td>
                      <td>{row.productName ?? "—"}</td>
                      <td>
                        {row.tileWidthCm && row.tileHeightCm
                          ? `${row.tileWidthCm}×${row.tileHeightCm} cm`
                          : "—"}
                      </td>
                      <td>{formatM2(row.quantityM2)}</td>
                      <td>{row.fullPallets}</td>
                      <td>{row.loosePieces}</td>
                      <td>
                        <Badge tone={row.status === "confirmed" ? "green" : "amber"}>
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </AppShell>
  );
}
