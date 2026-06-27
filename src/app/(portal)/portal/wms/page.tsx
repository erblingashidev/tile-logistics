"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select, Alert } from "@/components/ui";
import { sq } from "@/lib/i18n/sq";
import { BRAND } from "@/lib/brand";

interface Location {
  id: number;
  code: string;
  label: string | null;
}

export default function PortalWmsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [openSession, setOpenSession] = useState<{ id: number; name: string } | null>(
    null
  );
  const [tab, setTab] = useState<"receive" | "inventory">("receive");
  const [form, setForm] = useState({ ean: "", quantityM2: "", locationId: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/wms");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (res.status === 403) {
      setError(sq.noWmsAccess);
      return;
    }
    const data = await res.json();
    setLocations(data.locations ?? []);
    setOpenSession(data.openSession ?? null);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(action: "receive" | "inventory") {
    setError("");
    setSuccess("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ean: form.ean.trim(),
        quantityM2: Number(form.quantityM2),
        locationId: form.locationId ? Number(form.locationId) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }
    setSuccess(
      action === "receive" ? sq.receiveSuccess : sq.inventoryLineSaved
    );
    setForm({ ean: "", quantityM2: "", locationId: form.locationId });
    setTimeout(() => setSuccess(""), 3000);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{sq.wmsTitle}</p>
            <p className="text-xs text-zinc-500">{BRAND.shortName}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/portal" className="text-xs text-zinc-600 underline">
              {sq.ordersLink}
            </Link>
            <Button variant="ghost" className="text-xs" onClick={logout}>
              {sq.logout}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-16">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="warning">{success}</Alert>}

        <div className="flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-lg py-3 text-sm font-medium ${
              tab === "receive"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700"
            }`}
            onClick={() => setTab("receive")}
          >
            {sq.wmsReceive}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-3 text-sm font-medium ${
              tab === "inventory"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700"
            }`}
            onClick={() => setTab("inventory")}
            disabled={!openSession}
          >
            {sq.wmsInventory}
          </button>
        </div>

        {!openSession && tab === "inventory" && (
          <p className="text-sm text-amber-800">{sq.noOpenSession}</p>
        )}
        {openSession && tab === "inventory" && (
          <p className="text-sm text-green-800">
            {sq.sessionOpen}: {openSession.name}
          </p>
        )}

        <Card className="space-y-4 p-4">
          <p className="text-xs text-zinc-500">{sq.scanHint}</p>
          <Input
            placeholder={sq.ean}
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            className="text-lg"
          />
          <Input
            type="number"
            step="0.01"
            placeholder={sq.quantityM2}
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
            className="text-lg"
          />
          {tab === "receive" && (
            <Select
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
            >
              <option value="">{sq.selectLocation}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.label ? `— ${l.label}` : ""}
                </option>
              ))}
            </Select>
          )}
          <Button
            className="w-full py-4 text-lg"
            disabled={
              !form.ean ||
              !form.quantityM2 ||
              (tab === "receive" && !form.locationId)
            }
            onClick={() => submit(tab === "receive" ? "receive" : "inventory")}
          >
            {sq.save}
          </Button>
        </Card>
      </main>
    </div>
  );
}
