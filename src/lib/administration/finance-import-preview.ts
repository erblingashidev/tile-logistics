import * as XLSX from "xlsx";
import {
  isProDataTransactionBookHeaders,
  parseProDataTransactionBook,
  type ProDataImportAnalysis,
} from "@/lib/administration/prodata-transaction-book";

export type FinanceImportPreview = {
  format: "generic" | "prodata_transaction_book";
  fileName: string;
  sheetName: string;
  rowCount: number;
  columns: string[];
  sampleRows: string[][];
  prodata?: ProDataImportAnalysis;
};

const MAX_PREVIEW_ROWS = 8;

function previewGenericSpreadsheet(
  buffer: Buffer,
  fileName: string
): FinanceImportPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Workbook has no sheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Could not read the first sheet.");
  }
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    { header: 1, defval: "" }
  );
  if (rows.length === 0) {
    throw new Error("Sheet is empty.");
  }
  const headerRow = rows[0] ?? [];
  const columns = headerRow.map((cell, i) => {
    const label = String(cell ?? "").trim();
    return label || `Column ${i + 1}`;
  });
  const dataRows = rows.slice(1).filter((row) =>
    row.some((cell) => String(cell ?? "").trim().length > 0)
  );
  const sampleRows = dataRows.slice(0, MAX_PREVIEW_ROWS).map((row) =>
    columns.map((_, i) => String(row[i] ?? "").trim())
  );
  return {
    format: "generic",
    fileName,
    sheetName,
    rowCount: dataRows.length,
    columns,
    sampleRows,
  };
}

/** Parse finance export — auto-detects Pro-Data Libri i transaksioneve. */
export function previewFinanceSpreadsheet(
  buffer: Buffer,
  fileName: string
): FinanceImportPreview {
  const generic = previewGenericSpreadsheet(buffer, fileName);
  if (!isProDataTransactionBookHeaders(generic.columns)) {
    return generic;
  }
  try {
    const prodata = parseProDataTransactionBook(buffer, fileName);
    return {
      format: "prodata_transaction_book",
      fileName,
      sheetName: prodata.sheetName,
      rowCount: prodata.rowCount,
      columns: prodata.columns,
      sampleRows: prodata.sampleRows,
      prodata,
    };
  } catch {
    return generic;
  }
}
