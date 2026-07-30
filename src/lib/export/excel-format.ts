import * as XLSX from "xlsx";

export type ExportGroupBy = "none" | "region" | "truck" | "picker" | "driver";

export function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
  if (!base) base = "Group";
  let candidate = base;
  let i = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 24)} (${i})`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

export function applyTableLayout(
  ws: XLSX.WorkSheet,
  rowCount: number,
  colCount: number,
  options?: { freezeRow?: number }
) {
  const freezeRow = options?.freezeRow ?? 1;
  const lastCol = colLetter(Math.max(0, colCount - 1));
  const lastRow = Math.max(rowCount, freezeRow);

  ws["!autofilter"] = { ref: `A${freezeRow}:${lastCol}${lastRow}` };
  ws["!freeze"] = {
    xSplit: 0,
    ySplit: freezeRow,
    topLeftCell: `A${freezeRow + 1}`,
    activePane: "bottomLeft",
    state: "frozen",
  };

  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const cols: XLSX.ColInfo[] = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    let maxLen = 10;
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const v = cell?.v;
      if (v == null) continue;
      const len = String(v).length;
      if (len > maxLen) maxLen = Math.min(len + 2, 48);
    }
    cols.push({ wch: maxLen });
  }
  ws["!cols"] = cols;
}

export function appendMetaSheet(
  wb: XLSX.WorkBook,
  meta: Array<{ Field: string; Value: string }>
) {
  const ws = XLSX.utils.json_to_sheet(meta);
  applyTableLayout(ws, meta.length + 1, 2, { freezeRow: 1 });
  XLSX.utils.book_append_sheet(wb, ws, "About");
}
