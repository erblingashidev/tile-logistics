"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Button,
  Card,
  EmptyState,
  tableClass,
} from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { WarehouseNav } from "@/components/warehouse/WarehouseNav";

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

interface ProDataImportPrepPayload {
  products: Array<Record<string, unknown>>;
  balances: Array<Record<string, unknown>>;
  locationIds?: number[];
  productCount?: number;
  balanceCount?: number;
  locationCount?: number;
  negativesClamped?: number;
  warnings?: string[];
}

interface ProDataImportPrepResponse {
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
}

function readyImportPrep(
  prep: ProDataImportPrepResponse
): ProDataImportPrepPayload | null {
  if (!prep.ok || !prep.products || !prep.balances) return null;
  return {
    products: prep.products,
    balances: prep.balances,
    locationIds: prep.locationIds,
    productCount: prep.productCount,
    balanceCount: prep.balanceCount,
    locationCount: prep.locationCount,
    negativesClamped: prep.negativesClamped,
    warnings: prep.warnings,
  };
}

export default function WarehouseStockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [msg, setMsg] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [syncApiBusy, setSyncApiBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<{
    enabled: boolean;
    ok?: boolean;
    message?: string;
  } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [undoStatus, setUndoStatus] = useState<{
    canUndo: boolean;
    sealedAt: string | null;
    balanceLines: number;
    createdProducts: number;
    importSummary: {
      balancesWritten: number;
      productsCreated: number;
      balancesCleared: number;
    } | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUndoStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouse/stock/import");
      if (!res.ok) return;
      const data = await res.json();
      setUndoStatus({
        canUndo: Boolean(data.canUndo),
        sealedAt: data.sealedAt ?? null,
        balanceLines: data.balanceLines ?? 0,
        createdProducts: data.createdProducts ?? 0,
        importSummary: data.importSummary ?? null,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const loadApiStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouse/stock/sync");
      const data = await res.json();
      setApiStatus({
        enabled: Boolean(data.enabled ?? true),
        ok: data.ok,
        message: data.message ?? data.error,
      });
    } catch {
      setApiStatus({ enabled: false, message: "Could not reach sync API." });
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [s] = await Promise.all([fetch("/api/warehouse/stock")]);
      const stockJson = await s.json();
      if (!s.ok) {
        setStock([]);
        setLoadError(stockJson.error ?? "Could not load stock");
        return;
      }
      setStock(Array.isArray(stockJson) ? stockJson : []);
    } catch {
      setLoadError("Could not load stock — refresh and try again.");
    }
  }, []);

  useEffect(() => {
    load();
    loadUndoStatus();
    loadApiStatus();
  }, [load, loadUndoStatus, loadApiStatus]);

  const productTotals = useMemo(() => {
    const map = new Map<
      number,
      { ean: string | null; name: string | null; total: number; rows: number }
    >();
    for (const row of stock) {
      const cur = map.get(row.productId);
      if (!cur) {
        map.set(row.productId, {
          ean: row.ean,
          name: row.productName,
          total: row.quantityM2,
          rows: 1,
        });
      } else {
        cur.total += row.quantityM2;
        cur.rows += 1;
      }
    }
    return [...map.values()].filter((r) => r.rows > 1).slice(0, 8);
  }, [stock]);

  async function postImportJson(payload: Record<string, unknown>) {
    const res = await fetch("/api/warehouse/stock/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: {
      error?: string;
      created?: number;
      written?: number;
      cleared?: number;
    } = {};
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

  async function applyProDataImportPayload(prep: ProDataImportPrepPayload) {
    const products = prep.products;
    const balances = prep.balances;
    const locationIds = prep.locationIds ?? [];

    setMsg("Saving undo snapshot…");
    await postImportJson({ action: "snapshot", locationIds });

    let productsCreated = 0;
    const productChunk = 100;
    for (let i = 0; i < products.length; i += productChunk) {
      setMsg(
        `Products ${Math.min(i + productChunk, products.length)}/${products.length}…`
      );
      const data = await postImportJson({
        action: "products",
        products: products.slice(i, i + productChunk),
      });
      productsCreated += data.created ?? 0;
    }

    setMsg("Clearing previous Pro-Data stock…");
    const cleared = await postImportJson({
      action: "clear",
      locationIds,
    });

    let balancesWritten = 0;
    const balanceChunk = 150;
    for (let i = 0; i < balances.length; i += balanceChunk) {
      setMsg(
        `Balances ${Math.min(i + balanceChunk, balances.length)}/${balances.length}…`
      );
      const data = await postImportJson({
        action: "balances",
        balances: balances.slice(i, i + balanceChunk),
      });
      balancesWritten += data.written ?? 0;
    }

    await postImportJson({
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
          : "") +
        " · Undo is available if this looks wrong"
    );
    load();
    loadUndoStatus();
  }

  async function importProData(file: File | null) {
    if (!file) return;
    setImportBusy(true);
    setMsg("Reading Excel…");

    try {
      const body = new FormData();
      body.append("file", file);
      const prepRes = await fetch("/api/warehouse/stock/import", {
        method: "POST",
        body,
      });
      const prepText = await prepRes.text();
      let prep: ProDataImportPrepResponse = {};
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
      const payload = readyImportPrep(prep);
      if (!prepRes.ok || !payload) {
        setMsg(prep.error ?? `Import failed (HTTP ${prepRes.status})`);
        return;
      }

      await applyProDataImportPayload(payload);
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

  async function syncFromProDataApi() {
    if (
      !window.confirm(
        "Pull stock from Pro-Data API into this app?\n\nOnly Pro-Data warehouse locations are replaced. Putaway bins (STAGING, A-01, etc.) are not touched.\n\nYou can undo after import completes."
      )
    ) {
      return;
    }
    setSyncApiBusy(true);
    setMsg("Connecting to Pro-Data API…");
    try {
      const prepRes = await fetch("/api/warehouse/stock/sync", { method: "POST" });
      const prepText = await prepRes.text();
      let prep: ProDataImportPrepResponse = {};
      try {
        prep = prepText ? JSON.parse(prepText) : {};
      } catch {
        setMsg(`Sync prepare failed (HTTP ${prepRes.status}).`);
        return;
      }
      const payload = readyImportPrep(prep);
      if (!prepRes.ok || !payload) {
        setMsg(prep.error ?? `Sync failed (HTTP ${prepRes.status})`);
        return;
      }

      await applyProDataImportPayload(payload);
      loadApiStatus();
    } catch (err) {
      setMsg(
        err instanceof Error
          ? `Sync failed: ${err.message}`
          : "Sync failed — network error."
      );
    } finally {
      setSyncApiBusy(false);
    }
  }

  async function undoLastImport() {
    if (!undoStatus?.canUndo) return;
    const when = undoStatus.sealedAt
      ? new Date(undoStatus.sealedAt).toLocaleString()
      : "the last import";
    if (
      !window.confirm(
        `Undo Pro-Data import from ${when}?\n\nThis restores the previous Pro-Data stock snapshot and removes products created only by that import.`
      )
    ) {
      return;
    }
    setUndoBusy(true);
    setMsg("Undoing last import…");
    try {
      let done = false;
      let guard = 0;
      let last: {
        restoredBalances?: number;
        deletedProducts?: number;
        message?: string;
        done?: boolean;
        error?: string;
      } = {};
      while (!done && guard < 500) {
        guard += 1;
        const res = await fetch("/api/warehouse/stock/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "undo" }),
        });
        const text = await res.text();
        try {
          last = text ? JSON.parse(text) : {};
        } catch {
          setMsg(`Undo failed (HTTP ${res.status}).`);
          return;
        }
        if (!res.ok) {
          setMsg(last.error ?? `Undo failed (HTTP ${res.status})`);
          return;
        }
        if (last.message) setMsg(last.message);
        done = Boolean(last.done);
      }
      if (!done) {
        setMsg("Undo stopped early — try again.");
        return;
      }
      setMsg(
        `Undid last import: restored ${last.restoredBalances ?? 0} balances` +
          (last.deletedProducts
            ? ` · removed ${last.deletedProducts} new products`
            : "")
      );
      load();
      loadUndoStatus();
    } catch (err) {
      setMsg(
        err instanceof Error ? `Undo failed: ${err.message}` : "Undo failed"
      );
    } finally {
      setUndoBusy(false);
    }
  }

  async function clearAllStock() {
    if (
      !window.confirm(
        "Clear ALL warehouse stock to zero?\n\nThis deletes every stock line (all locations). Product lots stay in the catalog. You can import Pro-Data again afterward.\n\nThis cannot be undone with “Undo last import”."
      )
    ) {
      return;
    }
    const typed = window.prompt(
      'Type CLEAR ALL STOCK to confirm (exactly, uppercase):'
    );
    if (typed !== "CLEAR ALL STOCK") {
      setMsg("Clear cancelled — confirmation text did not match.");
      return;
    }
    setClearBusy(true);
    setMsg("Clearing all stock…");
    try {
      const res = await fetch("/api/warehouse/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_all",
          confirm: "CLEAR ALL STOCK",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Clear failed");
        return;
      }
      setMsg(
        `All stock cleared (${data.balancesRemoved ?? 0} lines removed). You can import Pro-Data now.`
      );
      load();
      loadUndoStatus();
    } catch (err) {
      setMsg(
        err instanceof Error ? `Clear failed: ${err.message}` : "Clear failed"
      );
    } finally {
      setClearBusy(false);
    }
  }

  return (
    <AppShell
      title="Stock levels"
      description="m² by lot and row · Pro-Data sync"
    >
      <WarehouseNav />

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
        <p className="mb-1 font-medium">Pro-Data stock sync</p>
        <p className="mb-3 text-xs text-zinc-500">
          Excel import (Finance+ export every ~2 days) or live API sync when{" "}
          <code className="rounded bg-zinc-100 px-1">PRODATA_SYNC_ENABLED=true</code>.
          Only Pro-Data warehouse areas are replaced; STAGING and outdoor rows are
          unchanged. Undo restores the previous Pro-Data snapshot. Day-to-day
          unload and mapping are on their own pages.
        </p>
        {apiStatus ? (
          <p className="mb-3 text-xs text-zinc-600">
            API:{" "}
            {apiStatus.enabled
              ? apiStatus.ok
                ? apiStatus.message ?? "Connected"
                : apiStatus.message ?? "Not connected"
              : "Disabled — set PRODATA_SYNC_ENABLED=true in .env.local"}
          </p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => void importProData(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={importBusy || syncApiBusy || undoBusy || clearBusy}
            onClick={() => fileRef.current?.click()}
          >
            {importBusy ? "Importing…" : "Import Pro-Data .xlsx"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={
              importBusy ||
              syncApiBusy ||
              undoBusy ||
              clearBusy ||
              apiStatus?.enabled === false
            }
            onClick={() => void syncFromProDataApi()}
          >
            {syncApiBusy ? "Syncing…" : "Sync from Pro-Data API"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={
              importBusy || syncApiBusy || undoBusy || clearBusy || !undoStatus?.canUndo
            }
            onClick={() => void undoLastImport()}
          >
            {undoBusy ? "Undoing…" : "Undo last import"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={importBusy || syncApiBusy || undoBusy || clearBusy}
            onClick={() => void clearAllStock()}
          >
            {clearBusy ? "Clearing…" : "Clear all stock to 0"}
          </Button>
        </div>
        {undoStatus?.canUndo && undoStatus.sealedAt ? (
          <p className="mt-2 text-xs text-zinc-500">
            Last import{" "}
            {new Date(undoStatus.sealedAt).toLocaleString()}
            {undoStatus.importSummary
              ? ` · ${undoStatus.importSummary.balancesWritten} balances`
              : ""}
            {undoStatus.createdProducts
              ? ` · ${undoStatus.createdProducts} new products`
              : ""}
            . Undo restores the previous Pro-Data stock.
          </p>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            No undo available yet — complete an import first.
          </p>
        )}
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
                <strong>{formatM2(p.total)} m²</strong> across {p.rows} rows
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
