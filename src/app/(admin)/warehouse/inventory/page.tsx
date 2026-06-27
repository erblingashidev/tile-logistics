"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface Session {
  id: number;
  name: string;
  status: string;
  startedAt: string;
}

interface Line {
  id: number;
  ean: string | null;
  quantityM2: number;
  productName: string | null;
  locationCode: string | null;
  countedAt: string;
}

interface Location {
  id: number;
  code: string;
}

export default function WarehouseInventoryPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [open, setOpen] = useState<Session | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [sessionName, setSessionName] = useState("");
  const [lineForm, setLineForm] = useState({ ean: "", quantityM2: "", locationId: "" });
  const [defaultLoc, setDefaultLoc] = useState("");

  const load = useCallback(async () => {
    const [inv, loc] = await Promise.all([
      fetch("/api/warehouse/inventory"),
      fetch("/api/warehouse/stock?view=locations"),
    ]);
    const data = await inv.json();
    setSessions(data.sessions ?? []);
    setOpen(data.open ?? null);
    setLocations(await loc.json());
    if (data.open) {
      const lr = await fetch(
        `/api/warehouse/inventory?sessionId=${data.open.id}`
      );
      setLines(await lr.json());
    } else {
      setLines([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startSession() {
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        name: sessionName || `Inventar ${new Date().getFullYear()}`,
      }),
    });
    setSessionName("");
    load();
  }

  async function addLine(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "line",
        sessionId: open.id,
        ean: lineForm.ean,
        quantityM2: Number(lineForm.quantityM2),
        locationId: lineForm.locationId ? Number(lineForm.locationId) : undefined,
      }),
    });
    setLineForm({ ean: "", quantityM2: "", locationId: "" });
    load();
  }

  async function closeSession() {
    if (!open || !defaultLoc) return;
    await fetch("/api/warehouse/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        sessionId: open.id,
        defaultLocationId: Number(defaultLoc),
      }),
    });
    load();
  }

  return (
    <AppShell title="Annual inventory">
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>

      {!open ? (
        <Card className="mb-6 p-4">
          <p className="mb-3 text-sm text-zinc-600">
            Start a count session. Staff enter EAN + m² on phones (/portal/wms).
            Names can be added later in the product catalog.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Session name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
            <Button onClick={startSession}>Start inventory</Button>
          </div>
        </Card>
      ) : (
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{open.name}</p>
              <Badge tone="green">Open — staff can count on phones</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={defaultLoc}
                onChange={(e) => setDefaultLoc(e.target.value)}
              >
                <option value="">Default location to apply stock</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={closeSession} disabled={!defaultLoc}>
                Close & apply to stock
              </Button>
            </div>
          </div>
          <form onSubmit={addLine} className="mt-4 grid gap-2 sm:grid-cols-4">
            <Input
              placeholder="EAN"
              value={lineForm.ean}
              onChange={(e) =>
                setLineForm({ ...lineForm, ean: e.target.value })
              }
            />
            <Input
              type="number"
              step="0.01"
              placeholder="m²"
              value={lineForm.quantityM2}
              onChange={(e) =>
                setLineForm({ ...lineForm, quantityM2: e.target.value })
              }
            />
            <Select
              value={lineForm.locationId}
              onChange={(e) =>
                setLineForm({ ...lineForm, locationId: e.target.value })
              }
            >
              <option value="">Location (optional)</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </Select>
            <Button type="submit">Add line (admin)</Button>
          </form>
        </Card>
      )}

      <h2 className="mb-2 font-semibold">Count lines {open ? `(session ${open.id})` : ""}</h2>
      {lines.length === 0 ? (
        <EmptyState title="No counts yet." />
      ) : (
        <div className="space-y-2">
          {lines.map((line) => (
            <Card key={line.id} className="p-3 text-sm">
              {line.ean} · {formatM2(line.quantityM2)} m²
              {line.locationCode ? ` · ${line.locationCode}` : ""}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 mt-8 font-semibold">Past sessions</h2>
      <div className="space-y-1 text-sm text-zinc-600">
        {sessions.map((s) => (
          <p key={s.id}>
            {s.name} — {s.status} — {s.startedAt.slice(0, 10)}
          </p>
        ))}
      </div>
    </AppShell>
  );
}
