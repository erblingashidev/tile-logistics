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

function findProductHeader(rows: unknown[][]): { headerRow: number; cols: ColumnMap } | null {
  for (let r = 0; r < rows.length; r++) {
    const cols: Partial<ColumnMap> = {};
    for (let c = 0; c < rows[r].length; c++) {
      const cell = normalizeCell(rows[r][c]).toLowerCase();
      if (cell === "no" || cell === "no.") cols.no = c;
      if (cell === "kodi") cols.kodi = c;
      if (cell === "emertimi" || cell === "emërtimi") cols.emertimi = c;
      if (cell === "sasia") cols.sasia = c;
      if (cell === "njesia" || cell === "njësia") cols.njesia = c;
    }
    if (
      cols.kodi != null &&
      cols.emertimi != null &&
      cols.sasia != null &&
      cols.njesia != null
    ) {
      return {
        headerRow: r,
        cols: cols as ColumnMap,
      };
    }
  }
  return null;
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

function findCustomerName(rows: unknown[][]): string | null {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = normalizeCell(rows[r][c]);
      if (!/^Bler[ëe]si:?$/i.test(cell)) continue;

      for (let c2 = c + 1; c2 < rows[r].length; c2++) {
        const value = normalizeCell(rows[r][c2]);
        if (value && value.length > 2) return value;
      }

      for (let r2 = r + 1; r2 < Math.min(r + 5, rows.length); r2++) {
        for (let c2 = 0; c2 < rows[r2].length; c2++) {
          const value = normalizeCell(rows[r2][c2]);
          if (!value || value.length < 3) continue;
          if (/^(adresa|telefoni|no fiskal|numri unik|data fatura)/i.test(value)) {
            continue;
          }
          if (/^\d+$/.test(value)) continue;
          return value;
        }
      }
    }
  }
  return null;
}

function findInvoiceNumber(rows: unknown[][]): string | null {
  for (const row of rows) {
    for (const cell of row) {
      const text = normalizeCell(cell);
      const match = text.match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
      if (match) return match[1].toUpperCase();
    }
  }
  return null;
}

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

export function parseAgimiExcel(buffer: Buffer): ParsedAgimiInvoice {
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
  const invoiceNumber = findInvoiceNumber(rows) ?? "";
  const documentKind =
    documentKindFromInvoiceNumber(invoiceNumber) ?? findDocumentKind(rows);
  const customerName = findCustomerName(rows) ?? "";

  const referentiHeader = findLabelColumn(rows, /Referenti\s*juaj/i);
  const salesAgent =
    referentiHeader && rows[referentiHeader.row + 1]
      ? normalizeCell(rows[referentiHeader.row + 1][referentiHeader.col])
      : undefined;

  const dateHeader = findLabelColumn(rows, /^Data fatura$/i);
  const orderDate =
    (dateHeader && rows[dateHeader.row + 1]
      ? parseExcelDateValue(rows[dateHeader.row + 1][dateHeader.col])
      : null) ?? new Date().toISOString().slice(0, 10);

  let address = "";
  let cityRaw = "";
  let customerPhone: string | undefined;

  const adresaCell = findLabelColumn(rows, /^Adresa:?$/i);
  if (adresaCell) {
    const sameRow = normalizeCell(rows[adresaCell.row][adresaCell.col + 1]);
    if (sameRow) address = sameRow;
    else {
      for (let c = 0; c < rows[adresaCell.row].length; c++) {
        const value = normalizeCell(rows[adresaCell.row][c]);
        if (value && !/^adresa:?$/i.test(value) && value.length > 5) {
          address = value;
          break;
        }
      }
    }
    const parts = address.split(/\s+/);
    cityRaw = parts[parts.length - 1] ?? "";
  }

  const telefoniCell = findLabelColumn(rows, /^Telefoni:?$/i);
  if (telefoniCell) {
    for (let c = telefoniCell.col + 1; c < rows[telefoniCell.row].length; c++) {
      const value = normalizeCell(rows[telefoniCell.row][c]);
      if (value && /\d/.test(value)) {
        customerPhone = value;
        break;
      }
    }
  }

  const price = findTotalPrice(rows) ?? 0;
  const productHeader = findProductHeader(rows);
  const items: OrderItemPayload[] = [];

  if (productHeader) {
    const { headerRow, cols } = productHeader;
    for (let r = headerRow + 1; r < rows.length; r++) {
      const row = rows[r];
      const ean = normalizeCell(row[cols.kodi]).replace(/\D/g, "");
      const name = normalizeCell(row[cols.emertimi]);
      const quantity = parseNumber(row[cols.sasia]);
      const unitRaw = normalizeCell(row[cols.njesia]);

      if (!ean && !name) continue;
      if (/^Normat\s+Tatimore/i.test(name)) break;
      if (/^Vlera\s/i.test(name)) break;
      if (!name || !unitRaw) continue;
      if (shouldSkipDeductionProduct(name, quantity)) continue;

      items.push(
        rowToOrderItem({
          ean,
          name,
          quantity,
          unitToken: unitRaw,
        })
      );
    }
  }

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
    warnings.push("Could not read invoice number — enter manually.");
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
