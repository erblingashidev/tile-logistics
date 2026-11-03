"use client";

import { useState } from "react";
import type { FinanceImportPreview } from "@/lib/administration/finance-import-preview";
import { financeDocumentCategoryLabel } from "@/lib/administration/prodata-transaction-book";
import { Alert, Button, Card, PageSection } from "@/components/ui";

function formatEuros(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

export function AdministrationFinanceImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncRegister, setSyncRegister] = useState(true);
  const [lastImport, setLastImport] = useState<string>("");

  async function runPreview() {
    if (!file) {
      setError("Choose a Pro-Data Excel export first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
    setLastImport("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/administration/imports/preview", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed");
      setPreview(data.preview as FinanceImportPreview);
      setMessage(data.message ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    if (preview?.format !== "prodata_transaction_book") {
      setError("Preview a Pro-Data transaction book before importing.");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (!syncRegister) form.append("syncRegister", "false");
      const res = await fetch("/api/administration/imports/commit", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setLastImport(data.message ?? "Import complete.");
      setMessage(data.message ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const prodata = preview?.prodata;

  return (
    <PageSection title="Pro-Data transaction book">
      <p className="-mt-2 mb-4 text-sm text-zinc-600">
        Upload <strong>Libri i transaksioneve</strong> exports from Pro-Data
        Finance+ (sheet &quot;Pro-Data Export&quot;). Lines are grouped by
        invoice, classified as sales, credit notes, or delivery documents, and
        merged into open debts, client totals, and sales-by-agent views. When
        payment method is filled, matching register payments can be created
        automatically.
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}
      {lastImport ? <Alert tone="info">{lastImport}</Alert> : null}

      <Card className="space-y-4 p-4">
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setMessage("");
            setError("");
            setLastImport("");
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy || !file} onClick={() => void runPreview()}>
            {busy ? "Reading…" : "Preview & classify"}
          </Button>
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={syncRegister}
              onChange={(e) => setSyncRegister(e.target.checked)}
            />
            Create register payments when payment method is present
          </label>
          <Button
            variant="primary"
            disabled={importing || !file || preview?.format !== "prodata_transaction_book"}
            onClick={() => void runImport()}
          >
            {importing ? "Importing…" : "Import into finance"}
          </Button>
        </div>
      </Card>

      {prodata ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-sm font-medium text-zinc-900">By document type</p>
            <ul className="mt-3 space-y-2 text-sm">
              {(
                Object.keys(prodata.byCategory) as Array<
                  keyof typeof prodata.byCategory
                >
              ).map((key) => {
                const row = prodata.byCategory[key];
                if (row.count === 0) return null;
                return (
                  <li
                    key={key}
                    className="flex justify-between gap-3 border-b border-zinc-100 pb-2"
                  >
                    <span>{financeDocumentCategoryLabel(key)}</span>
                    <span className="tabular-nums text-zinc-700">
                      {row.count} · {formatEuros(row.totalEuros)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-xs text-zinc-500">
              {prodata.openSalesCount} sale(s) without payment method on the
              export — these appear as invoiced amounts in debts until paid in
              the register.
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-sm font-medium text-zinc-900">Top sales agents</p>
            <ul className="mt-3 space-y-2 text-sm">
              {prodata.byAgent.slice(0, 8).map((row) => (
                <li
                  key={row.salesAgentName}
                  className="flex justify-between gap-3 border-b border-zinc-100 pb-2"
                >
                  <span className="truncate">{row.salesAgentName}</span>
                  <span className="shrink-0 tabular-nums text-zinc-700">
                    {row.invoiceCount} · {formatEuros(row.totalEuros)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {preview ? (
        <Card className="mt-6 overflow-x-auto p-4">
          <p className="mb-2 text-sm font-medium text-zinc-900">
            {preview.fileName} · sheet &quot;{preview.sheetName}&quot; ·{" "}
            {preview.rowCount} line(s)
            {preview.format === "prodata_transaction_book"
              ? " · Pro-Data format"
              : ""}
          </p>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                {preview.columns.map((col) => (
                  <th key={col} className="px-2 py-2 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sampleRows.map((row, i) => (
                <tr key={i} className="border-t">
                  {row.map((cell, j) => (
                    <td key={j} className="max-w-[14rem] truncate px-2 py-2">
                      {cell || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </PageSection>
  );
}
