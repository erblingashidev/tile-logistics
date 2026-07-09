import * as XLSX from "xlsx";
import { resolveLocation } from "@/lib/locations";
import type { OrderItemPayload } from "@/lib/services/orders";
import {
  type AgimiDocumentKind,
  type ParsedAgimiInvoice,
  documentKindFromInvoiceNumber,
} from "@/lib/invoices/parse-agimi-invoice";

function normalizeCell(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/\r\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExcelDateValue(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && value > 30000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = normalizeCell(value);
  const match = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return null;
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const text = normalizeCell(value).replace(/\s/g, "");
  if (!text) return 0;
  if (text.includes(",") && text.includes(".")) {
    return Number(text.replace(/,/g, "")) || 0;
  }
  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      return Number(`${parts[0].replace(/\./g, "")}.${parts[1]}`) || 0;
    }
    return Number(text.replace(/,/g, "")) || 0;
  }
  return Number(text.replace(/,/g, "")) || 0;
}

function shouldSkipDeductionProduct(name: string, quantity: number): boolean {
  if (/FURNIZIM\s+ME\s+KERAMIK/i.test(name)) return true;
  if (quantity <= 0) return true;
  return false;
}

function parseTileSizeFromName(name: string): { w: number; h: number } | null {
  const match = name.match(/(\d{2,3})\s*[xX×*]\s*(\d{2,3})/);
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

function normalizeUnitToken(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "m2" || t === "m²") return "M2";
  if (t === "kg") return "KG";
  if (t === "pako") return "PAKO";
  if (t === "thas") return "THAS";
  if (t.startsWith("cop")) return "COPE";
  if (t === "m" || t === "mtr" || t === "met" || t === "meter" || t === "metër") {
    return "METER";
  }
  return raw.toUpperCase();
}

function rowToOrderItem(row: {
  ean: string;
  name: string;
  quantity: number;
  unitToken: string;
}): OrderItemPayload {
  const productName = row.name.replace(/\s+/g, " ").trim();
  const productEan = row.ean.trim() || undefined;
  const tileSize = parseTileSizeFromName(productName);
  const unit = normalizeUnitToken(row.unitToken);

  if (unit === "M2") {
    return {
      unit: "m2",
      productName,
      productEan,
      ...(tileSize ? { tileWidthCm: tileSize.w, tileHeightCm: tileSize.h } : {}),
      quantityM2: row.quantity,
    };
  }
  if (unit === "KG") {
    return { unit: "kg", productName, productEan, weightKg: row.quantity };
  }
  if (unit === "METER") {
    return { unit: "meter", productName, productEan, lengthM: row.quantity };
  }
  return {
    unit: "piece",
    productName,
    productEan,
    manualPieces: Math.round(row.quantity * 100) / 100,
  };
}

type ColumnMap = {
  no?: number;
  kodi: number;
  emertimi: number;
  sasia: number;
  njesia: number;
};

type ProductTable = {
  headerRow: number;
  cols: ColumnMap;
};

function normalizeHeaderToken(value: unknown): string {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[.:]+$/g, "")
    .trim();
}

function isProductHeaderToken(token: string): keyof ColumnMap | null {
  if (token === "no") return "no";
  if (token === "kodi") return "kodi";
  if (token === "emertimi" || token === "emërtimi") return "emertimi";
  if (token === "sasia") return "sasia";
  if (token === "njesia" || token === "njësia") return "njesia";
  return null;
}

function isProductTableFooter(name: string, row: unknown[]): boolean {
  if (!name) {
    return row.every((cell) => !normalizeCell(cell));
  }
  return (
    /^Normat\s+Tatimore/i.test(name) ||
    /^Vlera(\s+me\s+TVSH|\s+per\s+pagese)?/i.test(name) ||
    /^Faturoi:/i.test(name) ||
    /^TVSH\s+e\s+llogaritur/i.test(name) ||
    /^Programi\s+i\s+implementuar/i.test(name)
  );
}

function findNearestDataColumn(
  row: unknown[],
  preferred: number,
  matches: (value: unknown) => boolean,
  span = 3
): number {
  for (let delta = 0; delta <= span; delta++) {
    const offsets = delta === 0 ? [0] : [-delta, delta];
    for (const offset of offsets) {
      const idx = preferred + offset;
      if (idx < 0 || idx >= row.length) continue;
      if (matches(row[idx])) return idx;
    }
  }
  return preferred;
}

function isKodiCell(value: unknown): boolean {
  const digits = normalizeCell(value).replace(/\D/g, "");
  return digits.length >= 7;
}

function isQuantityCell(value: unknown): boolean {
  if (typeof value === "number") return value !== 0;
  const text = normalizeCell(value);
  if (!text) return false;
  return /^-?\d/.test(text);
}

function isUnitCell(value: unknown): boolean {
  const token = normalizeUnitToken(normalizeCell(value));
  return ["M2", "KG", "THAS", "PAKO", "COPE", "METER"].includes(token);
}

function readColumnsFromHeaderRow(row: unknown[]): Partial<ColumnMap> {
  const cols: Partial<ColumnMap> = {};
  for (let c = 0; c < row.length; c++) {
    const key = isProductHeaderToken(normalizeHeaderToken(row[c]));
    if (key) cols[key] = c;
  }
  return cols;
}

function findProductNameInRow(
  row: unknown[],
  kodiCol: number,
  sasiaCol: number
): string {
  const start = Math.min(kodiCol, sasiaCol) + 1;
  const end = Math.max(kodiCol, sasiaCol);
  let best = "";
  for (let c = start; c <= end && c < row.length; c++) {
    const text = normalizeCell(row[c]);
    if (!text || isKodiCell(row[c]) || isQuantityCell(row[c]) || isUnitCell(row[c])) {
      continue;
    }
    if (text.length > best.length) best = text;
  }
  return best;
}

function extractProductFromRow(
  row: unknown[],
  cols: ColumnMap
): { ean: string; name: string; quantity: number; unitToken: string } | null {
  const kodiCol = findNearestDataColumn(row, cols.kodi, isKodiCell);
  const sasiaCol = findNearestDataColumn(row, cols.sasia, isQuantityCell);
  const njesiaCol = findNearestDataColumn(row, cols.njesia, isUnitCell);

  const ean = normalizeCell(row[kodiCol]).replace(/\D/g, "");
  let name = normalizeCell(row[cols.emertimi]);
  if (name.length < 3) {
    name = findProductNameInRow(row, kodiCol, sasiaCol);
  }

  const quantity = parseNumber(row[sasiaCol]);
  const unitRaw = normalizeCell(row[njesiaCol]);

  if (!ean && !name) return null;
  if (!name || name.length < 2) return null;
  if (/^(no|kodi|emertimi|sasia|njesia)$/i.test(name)) return null;
  if (!unitRaw) return null;
  if (shouldSkipDeductionProduct(name, quantity)) return null;

  return { ean, name, quantity, unitToken: unitRaw };
}

function looksLikeProductRow(row: unknown[], cols: ColumnMap): boolean {
  return extractProductFromRow(row, cols) != null;
}

function calibrateProductColumns(
  rows: unknown[][],
  headerRow: number,
  cols: ColumnMap
): ColumnMap {
  const sampleRows = rows.slice(headerRow + 1, headerRow + 8);
  const sampleRow = sampleRows.find((row) => looksLikeProductRow(row, cols));
  if (!sampleRow) return cols;

  const noShift =
    cols.no != null &&
    cols.no > 0 &&
    /^\d+$/.test(normalizeCell(sampleRow[cols.no - 1])) &&
    !normalizeCell(sampleRow[cols.no])
      ? 1
      : 0;

  const base = {
    no: cols.no,
    kodi: cols.kodi - noShift,
    emertimi: cols.emertimi,
    sasia: cols.sasia - noShift,
    njesia: cols.njesia - noShift,
  };

  return {
    no: base.no,
    kodi: findNearestDataColumn(sampleRow, base.kodi, isKodiCell),
    emertimi: base.emertimi,
    sasia: findNearestDataColumn(sampleRow, base.sasia, isQuantityCell),
    njesia: findNearestDataColumn(sampleRow, base.njesia, isUnitCell),
  };
}

function findProductTable(rows: unknown[][]): ProductTable | null {
  let best: ProductTable | null = null;
  let bestScore = 0;

  for (let r = 0; r < rows.length; r++) {
    const rawCols = readColumnsFromHeaderRow(rows[r]);
    if (
      rawCols.kodi == null ||
      rawCols.emertimi == null ||
      rawCols.sasia == null ||
      rawCols.njesia == null
    ) {
      continue;
    }

    const cols = calibrateProductColumns(rows, r, rawCols as ColumnMap);
    let score = 0;
    for (let r2 = r + 1; r2 < Math.min(r + 8, rows.length); r2++) {
      if (looksLikeProductRow(rows[r2], cols)) score += 1;
    }
    if (score === 0) continue;

    if (score > bestScore) {
      bestScore = score;
      best = { headerRow: r, cols };
    }
  }

  return best;
}

function parseProductRows(rows: unknown[][], table: ProductTable): OrderItemPayload[] {
  const items: OrderItemPayload[] = [];
  const { headerRow, cols } = table;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const nameProbe = normalizeCell(row[cols.emertimi]);
    if (isProductTableFooter(nameProbe, row)) break;

    const product = extractProductFromRow(row, cols);
    if (!product) {
      if (items.length > 0 && row.every((cell) => !normalizeCell(cell))) {
        break;
      }
      continue;
    }

    items.push(rowToOrderItem(product));
  }

  return items;
}

function readLabelCellBelow(
  rows: unknown[][],
  label: RegExp
): unknown | undefined {
  const anchor = findLabelColumn(rows, label);
  if (!anchor) return undefined;

  for (let r = anchor.row + 1; r < Math.min(anchor.row + 6, rows.length); r++) {
    const value = rows[r]?.[anchor.col];
    if (value == null || value === "") continue;
    const text = normalizeCell(value);
    if (!text || label.test(text)) continue;
    if (/^(data|kushtet|referenca|lokacioni|user|referenti)/i.test(text)) {
      continue;
    }
    return value;
  }

  const sameRow = rows[anchor.row][anchor.col + 1];
  if (sameRow != null && sameRow !== "" && !label.test(normalizeCell(sameRow))) {
    return sameRow;
  }

  return undefined;
}

function readLabelValueBelow(
  rows: unknown[][],
  label: RegExp
): string | undefined {
  const value = readLabelCellBelow(rows, label);
  if (value == null) return undefined;
  const text = normalizeCell(value);
  return text || undefined;
}

function findLabelColumn(rows: unknown[][], label: RegExp): { row: number; col: number } | null {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (label.test(normalizeCell(rows[r][c]))) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function isPhoneLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/[\d]/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  return /^(\+383|383|0)?[\d\s./-]+$/.test(trimmed.replace(/\s/g, ""));
}

function isFiscalLine(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return (
    digits.length >= 7 &&
    digits.length <= 13 &&
    /^[\d\s./-]+$/.test(text.trim())
  );
}

function isBuyerBlockStop(text: string): boolean {
  return /^(data fatura|no fiskal|numri unik|nui:|kushtet|user|referenca|referenti|lokacioni)/i.test(
    text
  );
}

function invoiceNumberFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  const base = fileName.replace(/\.xlsx?$/i, "");
  const match = base.match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
  return match ? match[1].toUpperCase() : null;
}

function parseExcelBuyerBlock(rows: unknown[][]): {
  customerName: string;
  address: string;
  cityRaw: string;
  customerPhone?: string;
} {
  const bleresi = findLabelColumn(rows, /^Bler[ëe]si:?$/i);
  if (!bleresi) {
    return { customerName: "", address: "", cityRaw: "" };
  }

  const dataFaturaRow = findLabelColumn(rows, /^Data fatura$/i)?.row ?? rows.length;
  const productTableRow = findProductTable(rows)?.headerRow ?? rows.length;
  const stopRow = Math.min(dataFaturaRow, productTableRow);

  const colCounts = new Map<number, number>();
  for (let r = bleresi.row + 1; r < stopRow; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const value = normalizeCell(rows[r][c]);
      if (!value || isBuyerBlockStop(value)) continue;
      colCounts.set(c, (colCounts.get(c) ?? 0) + 1);
    }
  }

  let valueCol = bleresi.col + 1;
  let bestCount = 0;
  for (const [col, count] of colCounts) {
    if (count > bestCount) {
      bestCount = count;
      valueCol = col;
    }
  }
  for (let c = bleresi.col + 1; c < rows[bleresi.row].length; c++) {
    const sameRowValue = normalizeCell(rows[bleresi.row][c]);
    if (sameRowValue.length > 2) {
      valueCol = c;
      break;
    }
  }

  const lines: string[] = [];
  for (let r = bleresi.row + 1; r < stopRow; r++) {
    const value = normalizeCell(rows[r][valueCol]);
    if (!value || isBuyerBlockStop(value)) continue;
    if (/^(adresa|telefoni|qyteti)\s*:?$/i.test(value)) continue;
    lines.push(value);
  }

  let customerName = "";
  let address = "";
  let cityRaw = "";
  let customerPhone: string | undefined;
  const addressLines: string[] = [];

  for (const line of lines) {
    if (isPhoneLine(line)) {
      customerPhone = line.replace(/\s+/g, " ").trim();
      continue;
    }
    if (isFiscalLine(line)) continue;
    if (!customerName) {
      customerName = line;
      continue;
    }
    addressLines.push(line);
  }

  if (addressLines.length === 1) {
    address = addressLines[0];
    cityRaw = addressLines[0];
  } else if (addressLines.length >= 2) {
    address = addressLines.slice(0, -1).join(", ");
    cityRaw = addressLines[addressLines.length - 1];
  }

  const labeledAddress = readLabelValueBelow(rows, /^Adresa\s*:?$/i);
  const labeledCity = readLabelValueBelow(rows, /^Qyteti\s*:?$/i);
  const labeledPhone = readLabelValueBelow(rows, /^Telefoni\s*:?$/i);

  if (labeledAddress) address = labeledAddress;
  if (labeledCity) cityRaw = labeledCity;
  if (labeledPhone) customerPhone = labeledPhone;

  if (!customerPhone) {
    for (let r = bleresi.row + 1; r < stopRow; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const value = normalizeCell(rows[r][c]);
        if (value && isPhoneLine(value)) {
          customerPhone = value;
          break;
        }
      }
      if (customerPhone) break;
    }
  }

  return { customerName, address, cityRaw, customerPhone };
}

function findCustomerName(rows: unknown[][]): string | null {
  const buyer = parseExcelBuyerBlock(rows);
  return buyer.customerName || null;
}

function findInvoiceNumber(rows: unknown[][], sourceFileName?: string): string {
  for (const row of rows) {
    for (const cell of row) {
      const text = normalizeCell(cell);
      const match = text.match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
      if (match) return match[1].toUpperCase();

      const labeled = text.match(
        /(?:Nr\.?\s*fatur[ëe]?|Numri\s*fatur[ëe]s)\s*[:#]?\s*([\d-]{10,})/i
      );
      if (labeled) {
        const normalized = labeled[1].replace(/\s+/g, "").toUpperCase();
        if (/\d{2}-(?:SHV|SHF|PSV)/i.test(normalized)) return normalized;
      }
    }
  }

  const referenca = readLabelValueBelow(rows, /^Referenca$/i);
  if (referenca) {
    const match = referenca.match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
    if (match) return match[1].toUpperCase();
  }

  return invoiceNumberFromFileName(sourceFileName) ?? "";
}

export type ParseAgimiExcelOptions = {
  sourceFileName?: string;
};

function findDocumentKind(rows: unknown[][]): AgimiDocumentKind {
  for (const row of rows) {
    for (const cell of row) {
      const text = normalizeCell(cell).toUpperCase();
      if (text.includes("FLET") && text.includes("DERGESE")) return "delivery_note";
      if (text.includes("PRO-FATUR") || text.includes("PRO FATUR")) return "pro_forma";
      if (text === "FATURE" || text === "FATURË") return "sales_invoice";
    }
  }
  return "unknown";
}

function findTotalPrice(rows: unknown[][]): number | null {
  for (const row of rows) {
    const flat = row.map((cell) => normalizeCell(cell)).join(" ");
    const labeled = flat.match(/Vlera\s+per\s+pagese:?\s*([\d.,]+)/i);
    if (labeled) return parseNumber(labeled[1]);

    for (let c = 0; c < row.length; c++) {
      const cell = normalizeCell(row[c]);
      if (/^Vlera\s+per\s+pagese:?$/i.test(cell)) {
        for (let c2 = c + 1; c2 < row.length; c2++) {
          const amount = parseNumber(row[c2]);
          if (amount > 0) return amount;
        }
      }
    }
  }

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (!/EUR/i.test(normalizeCell(rows[r][c]))) continue;
      for (let c2 = c - 1; c2 >= 0; c2--) {
        const amount = parseNumber(rows[r][c2]);
        if (amount > 100) return amount;
      }
    }
  }

  return null;
}

function resolveDeliveryFields(cityRaw: string, address: string) {
  const cityClean = cityRaw.replace(/-KOSOVA/i, "").replace(/,.*$/, "").trim();
  let loc = resolveLocation(cityClean) ?? resolveLocation(cityRaw);
  const region = loc?.region ?? cityClean;
  const city = loc?.city ?? cityClean;
  const location = address.trim() || loc?.name || city;
  return {
    region,
    city,
    location,
    locationId: loc?.id,
    lat: loc?.lat,
    lng: loc?.lng,
  };
}

export function parseAgimiExcel(
  buffer: Buffer,
  options?: ParseAgimiExcelOptions
): ParsedAgimiInvoice {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return emptyParsedInvoice(["Could not read Excel file — no sheets found."]);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
  });

  const warnings: string[] = [];
  const invoiceNumber =
    findInvoiceNumber(rows, options?.sourceFileName) || "";
  const documentKind =
    documentKindFromInvoiceNumber(invoiceNumber) ?? findDocumentKind(rows);
  const buyer = parseExcelBuyerBlock(rows);
  const customerName = buyer.customerName || findCustomerName(rows) || "";

  const salesAgent = readLabelValueBelow(rows, /Referenti\s*juaj/i);

  const orderDate =
    parseExcelDateValue(readLabelCellBelow(rows, /^Data fatura$/i)) ??
    new Date().toISOString().slice(0, 10);

  let address = buyer.address;
  let cityRaw = buyer.cityRaw;
  let customerPhone = buyer.customerPhone;

  const price = findTotalPrice(rows) ?? 0;
  const productTable = findProductTable(rows);
  const items = productTable ? parseProductRows(rows, productTable) : [];

  const locationFields =
    cityRaw || address
      ? resolveDeliveryFields(cityRaw, address)
      : {
          region: "",
          city: "",
          location: address || "—",
          locationId: undefined,
          lat: undefined,
          lng: undefined,
        };

  if (!invoiceNumber) {
    warnings.push(
      "Could not read invoice number from Excel — enter manually (or save the file as 26-SHV01-001-XXXX.xlsx)."
    );
  }
  if (!salesAgent) {
    warnings.push("Could not read Referenti Juaj — enter manually if needed.");
  }
  if (!customerName) {
    warnings.push("Could not read customer name — enter manually.");
  }
  if (items.length === 0) {
    warnings.push("No products found in Excel table — check the file format.");
  }
  if (!cityRaw && documentKind !== "delivery_note") {
    warnings.push("No delivery city on document — select region on the form.");
  }

  return {
    documentKind,
    invoiceNumber,
    salesAgent: salesAgent || undefined,
    customerName,
    address,
    city: locationFields.city,
    region: locationFields.region,
    locationId: locationFields.locationId,
    lat: locationFields.lat,
    lng: locationFields.lng,
    orderDate,
    price,
    customerPhone,
    items,
    warnings,
  };
}

function emptyParsedInvoice(warnings: string[]): ParsedAgimiInvoice {
  return {
    documentKind: "unknown",
    invoiceNumber: "",
    customerName: "",
    address: "",
    city: "",
    region: "",
    orderDate: new Date().toISOString().slice(0, 10),
    price: 0,
    items: [],
    warnings,
  };
}
