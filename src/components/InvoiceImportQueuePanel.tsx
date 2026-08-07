"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, CollapsibleCard, Input, SegmentedControl, Select } from "@/components/ui";
import { todayFolderDateLabel } from "@/lib/invoices/folder-date";
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
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"pending" | "rejected" | "dismissed">("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [scanAvailable, setScanAvailable] = useState(false);
  const [watchRoot, setWatchRoot] = useState("");
  const [dateFolders, setDateFolders] = useState<string[]>([]);
  const [folderDate, setFolderDate] = useState(() => todayFolderDateLabel());
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
      setDismissedCount(data.dismissedCount ?? 0);
      setConfigured(Boolean(data.configured));
      setScanAvailable(Boolean(data.scanAvailable));
      setWatchRoot(typeof data.watchRoot === "string" ? data.watchRoot : "");
      const folders = Array.isArray(data.dateFolders)
        ? (data.dateFolders as string[])
        : [];
      setDateFolders(folders);
      if (folders.length > 0) {
        setFolderDate((current) =>
          folders.includes(current) ? current : folders[0]!
        );
      }
      if (data.folderListError && !data.scanAvailable) {
        setScanHint(String(data.folderListError));
      }
  }, [tab]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function scanFolder() {
    if (!configured) {
      onError("Invoice folder is not configured on the server.");
      return;
    }
    if (!scanAvailable) {
      onError(
        scanHint ||
          "Scan from the website is not available here. Run npm run watch:invoices:turso on the HP PC, then approve imports below."
      );
      return;
    }
    if (!folderDate.trim()) {
      onError("Enter a date folder name, e.g. 6.8.2026");
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
        body: JSON.stringify({ folderDate: folderDate.trim() }),
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
          `Queued ${data.queued} invoice(s) from folder ${folderDate.trim()} (${data.scanned} file(s) scanned)`
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
          `Remove "${label}" from the queue? You can restore it later from the Removed tab.`
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
        onWarning("Restored to pending");
        setTab("pending");
      } else if (action === "delete") {
        onWarning("Removed from queue");
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CollapsibleCard
      className="mb-4"
      title="Import queue"
      headerTone="amber"
      expanded={expanded}
      onExpandedChange={setExpanded}
      badge={
        pendingCount > 0 ? (
          <Badge tone="amber">{pendingCount} pending</Badge>
        ) : rejectedCount > 0 ? (
          <Badge tone="slate">{rejectedCount} declined</Badge>
        ) : dismissedCount > 0 ? (
          <Badge tone="slate">{dismissedCount} removed</Badge>
        ) : null
      }
    >
      {configured ? (
        <div className="space-y-3">
          {watchRoot ? (
            <p className="text-xs text-zinc-500">
              Invoice folder: <span className="font-mono">{watchRoot}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            {dateFolders.length > 0 ? (
              <Select
                label="Date folder"
                value={folderDate}
                onChange={(e) => setFolderDate(e.target.value)}
                className="min-w-[160px]"
              >
                {dateFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                label="Date folder"
                value={folderDate}
                onChange={(e) => setFolderDate(e.target.value)}
                placeholder="6.8.2026"
                className="min-w-[160px]"
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              disabled={scanning || !scanAvailable}
              onClick={() => void scanFolder()}
            >
              {scanning ? "Scanning…" : "Scan folder"}
            </Button>
          </div>
          {!scanAvailable ? (
            <p className="text-xs text-zinc-600">
              Online approval works from any device. To load new files into the
              queue, run{" "}
              <span className="font-mono">npm run watch:invoices:turso</span> on
              the HP PC (or scan here when the app runs on that same machine).
            </p>
          ) : null}
        </div>
      ) : null}

      {scanHint ? <Alert tone="warning">{scanHint}</Alert> : null}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "pending", label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { value: "rejected", label: `Declined${rejectedCount > 0 ? ` (${rejectedCount})` : ""}` },
          { value: "dismissed", label: `Removed${dismissedCount > 0 ? ` (${dismissedCount})` : ""}` },
        ]}
      />

      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {tab === "pending"
            ? "No pending imports."
            : tab === "rejected"
              ? "No declined imports."
              : "No removed imports."}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const invoiceNumber =
              invoiceOverrides[item.id] ??
              item.parsed.invoiceNumber ??
              "";
            return (
              <div
                key={item.id}
                className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/40 p-4"
              >
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
                          {item.reviewedAt && tab !== "pending"
                            ? ` · ${tab === "dismissed" ? "removed" : "declined"} ${new Date(item.reviewedAt).toLocaleString()}`
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
                      <Input
                        label="Invoice number"
                        value={invoiceNumber}
                        onChange={(e) =>
                          setInvoiceOverrides((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="font-mono"
                        placeholder="26-SHV01-001-7200"
                      />
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
                      {tab === "pending" ? (
                        <>
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
                                importQueueId: item.id,
                              });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busyId === item.id}
                            onClick={() => void review(item.id, "reject")}
                          >
                            Decline
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busyId === item.id}
                            onClick={() => void review(item.id, "delete")}
                          >
                            Remove
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            disabled={busyId === item.id}
                            onClick={() => void review(item.id, "restore")}
                          >
                            Restore to pending
                          </Button>
                          {tab === "rejected" ? (
                            <Button
                              variant="secondary"
                              disabled={busyId === item.id}
                              onClick={() => {
                                onOpenForm({
                                  ...item.form,
                                  invoiceNumber,
                                  importQueueId: item.id,
                                });
                              }}
                            >
                              Edit
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </CollapsibleCard>
  );
}
