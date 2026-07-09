"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import {
  agimiDocumentKindLabel,
  type AgimiDocumentKind,
} from "@/lib/invoices/parse-agimi-invoice";
import type { InvoiceImportFormState } from "@/components/InvoiceImportPanel";

type QueueItem = {
  id: number;
  status: string;
  sourceFileName: string;
  sourceFolderDate: string | null;
  duplicateOrderId: number | null;
  errorMessage: string | null;
  adminNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  parsed: {
    invoiceNumber: string;
    customerName: string;
    customerPhone?: string;
    salesAgent?: string;
    address: string;
    city: string;
    region: string;
    orderDate: string;
    price: number;
    items: Array<{
      productEan?: string;
      productName?: string;
      quantityM2?: number;
      weightKg?: number;
      lengthM?: number;
      manualPieces?: number;
      unit: string;
    }>;
    warnings: string[];
    documentKind: AgimiDocumentKind;
  };
  form: InvoiceImportFormState;
};

interface InvoiceImportQueuePanelProps {
  onOpenForm: (form: InvoiceImportFormState) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

export function InvoiceImportQueuePanel({
  onOpenForm,
  onChanged,
  onError,
  onWarning,
}: InvoiceImportQueuePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<"pending" | "rejected">("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [watchRoot, setWatchRoot] = useState("");
  const [configured, setConfigured] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [invoiceOverrides, setInvoiceOverrides] = useState<Record<number, string>>(
    {}
  );

  const [scanHint, setScanHint] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/orders/import-queue?status=${tab}`, {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items ?? []);
    setPendingCount(data.pendingCount ?? 0);
    setRejectedCount(data.rejectedCount ?? 0);
    setWatchRoot(data.watchRoot ?? "");
    setConfigured(Boolean(data.configured));
    if ((data.pendingCount ?? 0) > 0) setExpanded(true);
  }, [tab]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function scanFolder() {
    if (!configured) {
      onError(
        "Folder scan runs on the HP PC only. Set INVOICE_WATCH_DIR in .env.local and run npm run watch:invoices:turso."
      );
      return;
    }
    setScanning(true);
    onError("");
    setScanHint("");
    try {
      const res = await fetch("/api/orders/import-queue", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        onError((data.error as string) ?? (data.hint as string) ?? "Scan failed");
        if (data.hint) setScanHint(data.hint as string);
        return;
      }
      const errList = (data.errors as string[] | undefined) ?? [];
      if (data.hint) setScanHint(data.hint as string);
      if (errList.length > 0) {
        onError(errList.slice(0, 3).join(" · "));
      }
      if ((data.queued as number) > 0) {
        onWarning(
          `Queued ${data.queued} invoice(s) from ${data.scanned} file(s) scanned`
        );
      } else if ((data.scanned as number) > 0 && (data.skipped as number) > 0) {
        onWarning(
          `Scanned ${data.scanned} file(s) — all already in queue (${data.skipped} skipped)`
        );
      } else if ((data.scanned as number) === 0 && !data.hint && errList.length === 0) {
        onWarning("No Excel files found in the configured folder.");
      }
      await load();
    } finally {
      setScanning(false);
    }
  }

  async function review(
    id: number,
    action: "approve" | "reject" | "restore" | "delete",
    merge = false
  ) {
    if (action === "delete") {
      const item = items.find((row) => row.id === id);
      const label = item?.parsed.customerName || item?.sourceFileName || "this import";
      if (
        !window.confirm(
          `Remove "${label}" from the queue permanently? This cannot be undone.`
        )
      ) {
        return;
      }
    }

    setBusyId(id);
    onError("");
    try {
      const res = await fetch(`/api/orders/import-queue/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          merge,
          invoiceNumberOverride: invoiceOverrides[id]?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError((data.error as string) ?? "Action failed");
        return;
      }
      if (action === "approve") {
        onWarning(
          merge
            ? `Approved — merged into order ${data.invoiceNumber}`
            : `Approved — order ${data.invoiceNumber} created`
        );
        onChanged();
      } else if (action === "restore") {
        onWarning("Restored to pending queue");
        setTab("pending");
      } else if (action === "delete") {
        onWarning("Removed from import queue");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="mb-4 overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between gap-3 border-b border-zinc-200 bg-amber-50/80 px-5 py-4 text-left"
      >
        <div>
          <p className="text-base font-semibold text-zinc-900">
            Import queue
            {pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Approve, decline, or edit before orders are created
          </p>
        </div>
        <span className="text-sm text-zinc-400">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="space-y-4 p-5">
          <Alert tone="info">
            The import queue is stored online — deleting Excel files from the HP
            folder does not remove queue entries by itself. The HP watcher removes
            them on the next scan when the file is gone, or use{" "}
            <strong>Remove</strong> here anytime.
          </Alert>

          {configured ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={scanning}
                onClick={() => void scanFolder()}
              >
                {scanning ? "Scanning…" : "Scan folder now"}
              </Button>
              <p className="text-xs text-zinc-500">
                Local path:{" "}
                <span className="font-mono">{watchRoot}</span>
              </p>
            </div>
          ) : null}

          {scanHint && (
            <Alert tone="warning">{scanHint}</Alert>
          )}

          <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-3">
            <button
              type="button"
              onClick={() => setTab("pending")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "pending"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Pending{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setTab("rejected")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "rejected"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              Declined{rejectedCount > 0 ? ` (${rejectedCount})` : ""}
            </button>
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {tab === "pending"
                ? "No pending imports. Save Excel (.xlsx) files into a date folder on the HP PC while the watcher is running."
                : "No declined imports. Declined items stay here so you can restore or approve them later."}
            </p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const invoiceNumber =
                  invoiceOverrides[item.id] ??
                  item.parsed.invoiceNumber ??
                  "";
                return (
                  <Card key={item.id} className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-zinc-900">
                          {item.parsed.customerName || "—"}
                        </p>
                        <p className="mt-1 font-mono text-xs text-zinc-600">
                          {item.sourceFileName}
                          {item.sourceFolderDate
                            ? ` · ${item.sourceFolderDate}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {new Date(item.submittedAt).toLocaleString()} ·{" "}
                          {item.parsed.items.length} product(s) ·{" "}
                          {agimiDocumentKindLabel(item.parsed.documentKind)}
                          {item.reviewedAt && tab === "rejected"
                            ? ` · declined ${new Date(item.reviewedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                      {item.duplicateOrderId ? (
                        <Alert tone="warning">
                          Invoice already exists (order #{item.duplicateOrderId})
                        </Alert>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-medium text-zinc-600">
                          Invoice number
                        </span>
                        <input
                          value={invoiceNumber}
                          onChange={(e) =>
                            setInvoiceOverrides((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
                          placeholder="26-SHV01-001-7200"
                        />
                      </label>
                      <div className="text-sm">
                        <p className="text-xs font-medium text-zinc-500">Referenti</p>
                        <p>{item.parsed.salesAgent || "—"}</p>
                        <p className="mt-2 text-xs font-medium text-zinc-500">
                          Delivery
                        </p>
                        <p>
                          {[item.parsed.address, item.parsed.city, item.parsed.region]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </p>
                        {item.parsed.customerPhone ? (
                          <p className="mt-1 text-zinc-700">
                            Tel: {item.parsed.customerPhone}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {item.parsed.warnings.length > 0 && (
                      <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {item.parsed.warnings.map((w) => (
                          <li key={w}>• {w}</li>
                        ))}
                      </ul>
                    )}

                    {item.errorMessage && (
                      <Alert tone="error">{item.errorMessage}</Alert>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                      <Button
                        disabled={busyId === item.id || !invoiceNumber.trim()}
                        onClick={() =>
                          void review(
                            item.id,
                            "approve",
                            Boolean(item.duplicateOrderId)
                          )
                        }
                      >
                        {item.duplicateOrderId ? "Approve (merge)" : "Approve"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busyId === item.id}
                        onClick={() => {
                          onOpenForm({
                            ...item.form,
                            invoiceNumber,
                          });
                        }}
                      >
                        Edit
                      </Button>
                      {tab === "pending" ? (
                        <Button
                          variant="ghost"
                          disabled={busyId === item.id}
                          onClick={() => void review(item.id, "reject")}
                        >
                          Decline
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          disabled={busyId === item.id}
                          onClick={() => void review(item.id, "restore")}
                        >
                          Restore to pending
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        disabled={busyId === item.id}
                        onClick={() => void review(item.id, "delete")}
                      >
                        Remove
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
