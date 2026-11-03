"use client";

import { useState } from "react";
import type { FinanceImportPreview } from "@/lib/administration/finance-import-preview";
import { Alert, Button, Card, PageSection } from "@/components/ui";

export function AdministrationFinanceImport() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FinanceImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    if (!file) {
      setError("Choose an Excel or CSV export first.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setPreview(null);
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

  return (
    <PageSection title="Import from finance system">
      <p className="-mt-2 mb-4 text-sm text-zinc-600">
        Upload spreadsheets from your official finance tool (daily sales, payment
        methods, debts by agent — like your Finance Core exports). We will map
        columns to register lines, expenses, and client balances once you share a
        sample file.
      </p>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}

      <Card className="space-y-4 p-4">
        <input
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setMessage("");
            setError("");
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !file} onClick={() => void runPreview()}>
            Preview columns
          </Button>
        </div>
      </Card>

      {preview ? (
        <Card className="mt-6 overflow-x-auto p-4">
          <p className="mb-2 text-sm font-medium text-zinc-900">
            {preview.fileName} · sheet “{preview.sheetName}” ·{" "}
            {preview.rowCount} data row(s)
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
                    <td key={j} className="px-2 py-2 max-w-[14rem] truncate">
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
