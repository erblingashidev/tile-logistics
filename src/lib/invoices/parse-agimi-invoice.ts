import { resolveLocation, type LocationEntry } from "@/lib/locations";
import {
  parseUnitWeightKgFromName,
  type OrderUnit,
} from "@/lib/calculations";
import { normalizeOrderUnit } from "@/lib/constants";
import type { OrderItemPayload, OrderPayload } from "@/lib/services/orders";

export interface ParsedAgimiInvoice {
  documentKind: AgimiDocumentKind;
  invoiceNumber: string;
  /** Sales agent from Referenti Juaj / document header. */
  salesAgent?: string;
  customerName: string;
  address: string;
  city: string;
  region: string;
  locationId?: string;
  lat?: number;
  lng?: number;
  orderDate: string;
  price: number;
  customerPhone?: string;
  fiscalNumber?: string;
  items: OrderItemPayload[];
  warnings: string[];
}

function parseLocaleNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  if (hasComma && hasDot) {
    const lastComma = trimmed.lastIndexOf(",");
    const lastDot = trimmed.lastIndexOf(".");
    if (lastComma > lastDot) {
      return Number(trimmed.replace(/\./g, "").replace(",", ".")) || 0;
    }
    return Number(trimmed.replace(/,/g, "")) || 0;
  }

  if (hasComma) {
    const parts = trimmed.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      return Number(`${parts[0].replace(/\./g, "")}.${parts[1]}`) || 0;
    }
    return Number(trimmed.replace(/,/g, "")) || 0;
  }

  if (hasDot) {
    const parts = trimmed.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      return Number(trimmed) || 0;
    }
    return Number(trimmed.replace(/\./g, "")) || 0;
  }

  return Number(trimmed) || 0;
}

function normalizeInvoiceText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[♦•|]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/** Fix common OCR misreads on Albanian AGIMI invoice labels. */
function normalizeOcrInvoiceText(text: string): string {
  return (
    text
      .replace(/B1er[ëe]si/gi, "Blerësi")
      .replace(/Bleres[1lI]/gi, "Blerësi")
      .replace(/Bleresi/gi, "Blerësi")
      .replace(/Adre\s*sa/gi, "Adresa")
      .replace(/Qytet[1lI]/gi, "Qyteti")
      .replace(/Telefon[1lI]/gi, "Telefoni")
      .replace(/Emertim[1lI]/gi, "Emertimi")
      .replace(/Emërtim[1lI]/gi, "Emërtimi")
      .replace(/Barkod[1lI]/gi, "Barkodi")
      .replace(/Referenti\s+Juaj/gi, "Referenti Juaj")
      .replace(/Referenti\s*[:\.]?\s*[Jj]uaj/gi, "Referenti Juaj")
      .replace(/Referenti\s*Juaj/gi, "Referenti Juaj")
      .replace(/Njesia|Njesía|Njësia/gi, "Njesia")
      .replace(/Sas[1lI]a/gi, "Sasia")
      .replace(/No\s*Kodi\s*Emertimi/gi, "No Kodi Emertimi Sasia Njesia")
      .replace(/(\d+[.,]\d+)\.\s*(M2|KG|PAKO|THAS|Cop[ée]?|Cope)\b/gi, "$1 $2")
      .replace(/[_—«]+(?=\s*(?:M2|KG|PAKO|THAS|Cop[ée]?|Cope)\b)/gi, " ")
      .replace(/Pro\s*fatur[ëe]/gi, "Pro-faturë")
      .replace(/_—«/g, " ")
      .replace(/(\d)\.\s*(M2|KG)\b/gi, "$1 $2")
      .replace(/Fatura\s+d[ëe]rgohet\s+n[ëe]/gi, "Fatura dërgohet në")
      .replace(/Malli\s+d[ëe]rgohet\s+n[ëe]/gi, "Malli dërgohet në")
      .replace(/Flet[ëe]\s*d[ëe]rges[ëe]/gi, "Fletë dërgese")
      .replace(/Adresa\s+primare/gi, "Adresa primare")
      .replace(/([0-9]{2})\s*-\s*SHV\s*O(\d)/gi, "$1-SHV$2")
      .replace(/([0-9]{2})\s*-\s*SHV\s*(\d)\s+(\d)\s*-\s*(\d{3})\s*-\s*(\d{4})/gi, "$1-SHV$2$3-$4-$5")
      .replace(
        /([0-9]{2})\s*-\s*(SHV|SHF|PSV)\s*(\d)\s+(\d)\s*-\s*(\d{3})\s*-\s*(\d{3,4})/gi,
        "$1-$2$3$4-$5-$6"
      )
  );
}

export type AgimiDocumentKind =
  | "sales_invoice"
  | "pro_forma"
  | "delivery_note"
  | "service_sheet"
  | "unknown";

export function agimiDocumentKindLabel(kind: AgimiDocumentKind): string {
  if (kind === "pro_forma") return "Pro-faturë";
  if (kind === "sales_invoice") return "Faturë";
  if (kind === "delivery_note") return "Fletë dërgese";
  if (kind === "service_sheet") return "Fletë shërbimi";
  return "AGIMI document";
}

function documentKindFromInvoiceNumber(invoiceNumber: string | null): AgimiDocumentKind | null {
  if (!invoiceNumber) return null;
  const upper = invoiceNumber.toUpperCase();
  if (/-PSV\d/.test(upper)) return "pro_forma";
  if (/-SHV\d/.test(upper)) return "sales_invoice";
  if (/-SHF\d/.test(upper)) return "delivery_note";
  return null;
}

interface ParsedDestination {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
}

const SALES_AGENT_HEADER_TOKENS =
  /^(?:Lokacioni|Referenca|User|Kushtet|Data fatura|Data e skadimit|Referenti juaj|Referenti Juaj)$/i;

/** Short warehouse/region code between invoice dates and agent name (PR, AL, PE…). */
const AGIMI_LOCATION_CODE = /[A-Z]{2,4}\b/;

function parseReferentiJuajLabel(text: string): string | null {
  const inline = text.match(
    /Referenti\s+(?:Juaj\s*)?[:\-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.-]{1,50})/i
  );
  if (inline) {
    const cleaned = cleanSalesAgentName(inline[1]);
    if (cleaned && !SALES_AGENT_HEADER_TOKENS.test(cleaned)) return cleaned;
  }

  const lines = text.split("\n").map((line) => line.trim());
  for (let i = 0; i < lines.length; i++) {
    if (!/^Referenti\s+(?:Juaj\s*)?[:\-]?$/i.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const candidate = lines[j];
      if (!candidate || /^\d{2}\.\d{2}\.\d{4}/.test(candidate)) break;
      const cleaned = cleanSalesAgentName(candidate);
      if (cleaned && !SALES_AGENT_HEADER_TOKENS.test(cleaned)) return cleaned;
    }
  }

  return null;
}

function parseSalesAgentFromDateRow(text: string): string | null {
  for (const match of text.matchAll(
    /(\d{2}\.\d{2}\.\d{4})\s+\1\s+([^|\n]+?)\s+(\d{3})\b/g
  )) {
    const segment = match[2].trim().replace(/\s+/g, " ");
    const parts = segment.split(" ").filter(Boolean);
    if (parts.length >= 3 && /^[A-Z]{2,4}$/.test(parts[0])) {
      const referentiOnly = cleanSalesAgentName(parts.slice(1).join(" "));
      if (referentiOnly) return referentiOnly;
    }
    const cleaned = cleanSalesAgentName(segment);
    if (cleaned && !SALES_AGENT_HEADER_TOKENS.test(cleaned)) return cleaned;
  }

  for (const line of text.split("\n")) {
    const withoutLocation = line.match(
      /\d{2}\.\d{2}\.\d{4}\s+\d{2}\.\d{2}\.\d{4}\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.-]{2,50}?)\s+\d{3}\b/
    );
    if (withoutLocation) {
      const cleaned = cleanSalesAgentName(withoutLocation[1]);
      if (cleaned && !SALES_AGENT_HEADER_TOKENS.test(cleaned)) return cleaned;
    }
  }

  return null;
}

function parseSalesAgentFromProDataAdminTable(text: string): string | null {
  if (!/Referenti\s*juaj/i.test(text)) return null;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!/\d{2}\.\d{2}\.\d{4}/.test(trimmed)) continue;

    const agimiCompany = trimmed.match(/AGIMI\s+COM\s+SH[^0-9\n]*?(?=\d{3}\b)/i);
    if (agimiCompany) {
      const cleaned = cleanSalesAgentName(agimiCompany[0]);
      if (cleaned) return cleaned;
    }

    const glued = trimmed.match(
      /^(\d{2}\.\d{2}\.\d{4}).*?(\d{2}\.\d{2}\.\d{4})([A-Za-zÀ-ÿ]+?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.-]+?)\s*(\d{3})\s*$/
    );
    if (!glued) continue;

    const referenti = cleanSalesAgentName(glued[4]);
    if (referenti && !SALES_AGENT_HEADER_TOKENS.test(referenti)) return referenti;
  }

  return null;
}

function parseSalesAgentFromProDataPdfRow(text: string): string | null {
  const spaced = text.match(
    new RegExp(
      `(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(${AGIMI_LOCATION_CODE.source})\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\\s.-]{1,40}?)\\s+(\\d{3})\\b`
    )
  );
  if (spaced) return cleanSalesAgentName(spaced[4]);

  const match = text.match(
    /(\d{2}\.\d{2}\.\d{4})(\d{2}\.\d{2}\.\d{4})([A-Z]{2,4})([A-Z][a-zA-ZëçÇ]+(?:\s+[A-Z][a-zA-ZëçÇ]+)*)(\d{3})\b/
  );
  if (!match) return null;
  return cleanSalesAgentName(match[4]);
}

function parseSalesAgent(text: string): string | null {
  const fromLabel = parseReferentiJuajLabel(text);
  if (fromLabel) return fromLabel;

  const fromProDataAdmin = parseSalesAgentFromProDataAdminTable(text);
  if (fromProDataAdmin) return fromProDataAdmin;

  const fromDateRow = parseSalesAgentFromDateRow(text);
  if (fromDateRow) return fromDateRow;

  const fromPdfRow = parseSalesAgentFromProDataPdfRow(text);
  if (fromPdfRow) return fromPdfRow;

  for (const line of text.split("\n")) {
    const row = line.match(
      new RegExp(
        `\\d{2}\\.\\d{2}\\.\\d{4}\\s+\\d{2}\\.\\d{2}\\.\\d{4}\\s+${AGIMI_LOCATION_CODE.source}\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\\s.-]{2,40}?)\\s+\\d{3}\\b`
      )
    );
    if (row) {
      const cleaned = cleanSalesAgentName(row[1]);
      if (cleaned) return cleaned;
    }
  }

  return null;
}

function cleanSalesAgentName(raw: string): string | null {
  let name = raw
    .replace(/\s+/g, " ")
    .replace(/\b001\b/g, "")
    .trim();

  if (!name || name.length < 2) return null;
  if (/^\d+$/.test(name)) return null;
  if (/^(QERAMIKA|Bleresi|Blerësi)$/i.test(name)) return null;

  if (/^AGIMI\s*COM\s*SH/i.test(name)) {
    return "AGIMI COM SHPK";
  }

  name = name
    .replace(/\bAGIMI\b.*$/i, "")
    .replace(/\bCOM\b.*$/i, "")
    .replace(/\bSH\.?P\.?K\.?\b.*$/i, "")
    .trim();

  if (!name || name.length < 2) return null;
  if (/^\d+$/.test(name)) return null;
  if (/^(QERAMIKA|Bleresi|Blerësi)$/i.test(name)) return null;
  return name;
}

/** Distinguish Pro-faturë, Faturë, Fletë dërgese, and internal warehouse forms. */
export function detectAgimiDocumentKind(text: string): AgimiDocumentKind {
  const normalized = normalizeOcrInvoiceText(normalizeInvoiceText(text));
  const fromNumber = documentKindFromInvoiceNumber(parseInvoiceNumber(normalized));

  const looksLikeDeliveryNote =
    /Flet[ëe]\s*d[ëe]rges/i.test(normalized) ||
    (/Fatura\s+dërgohet\s+në/i.test(normalized) &&
      /Malli\s+dërgohet\s+në/i.test(normalized)) ||
    fromNumber === "delivery_note";

  const looksLikeProForma =
    /Pro\s*[- ]?\s*fatur[ëe]/i.test(normalized) ||
    fromNumber === "pro_forma";

  const looksLikeSalesInvoice =
    /\bFatur[ëe]\b/i.test(normalized) ||
    /Bler[ëe]si\s*:/i.test(normalized) ||
    /Normat\s+Tatimore/i.test(normalized) ||
    /Vlera\s*per\s*pagese|per\s*pagese:/i.test(normalized) ||
    /Emertimi|Emërtimi/i.test(normalized) ||
    fromNumber === "sales_invoice";

  const looksLikeServiceSheet =
    /FLET[ËE]\s*SH[ËE]RBIMI|FLETE\s+SHERBIMI/i.test(normalized);

  if (looksLikeDeliveryNote) return "delivery_note";
  if (looksLikeProForma) return "pro_forma";
  if (looksLikeSalesInvoice) return "sales_invoice";
  if (looksLikeServiceSheet) return "service_sheet";
  return "unknown";
}

function parseInvoiceDate(text: string): string | null {
  const labeled = text.match(
    /Data\s+fatur[ëe]?\s*:?\s*(\d{2})\.(\d{2})\.(\d{4})/i
  );
  if (labeled) {
    return `${labeled[3]}-${labeled[2]}-${labeled[1]}`;
  }

  const adminRow = text.match(
    /(\d{2}\.\d{2}\.\d{4})\s+\1\s+[^|\n]+\s+\d{3}\b/
  );
  if (adminRow) {
    const m = adminRow[0].match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }

  const dates = [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].map(
    (m) => `${m[3]}-${m[2]}-${m[1]}`
  );
  if (dates.length === 0) return null;
  return dates[0];
}

function looksLikeOcrGarbageLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return true;
  if (/^;\s*[\d.,]+$/.test(t)) return true;
  if (/^[A-Za-z]{2,4}\s+[A-Z]{2,4}\/?$/.test(t)) return true;
  if (/^[^A-Za-z0-9]*$/.test(t)) return true;
  return false;
}

function parseCustomerName(text: string): string | null {
  const match = text.match(
    /Bler[ëe]si:\s*([\s\S]+?)(?:\n\s*(?:Adresa|No fiskal|Numri unik|NUI:|Nr\.\s*TVSH|\d{2}\.\d{2}\.\d{4}))/i
  );
  if (!match) {
    const loose = text.match(/Bler[ëe]si:\s*\n?\s*([^\n]+)/i);
    if (!loose) return null;
    const single = loose[1].trim();
    return looksLikeOcrGarbageLine(single) ? null : single;
  }

  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^I[''']?$/i.test(line))
    .filter((line) => !/^No fiskal:/i.test(line))
    .filter((line) => !/^Numri unik:/i.test(line))
    .filter((line) => !looksLikeOcrGarbageLine(line));

  const name = (lines[0] ?? lines.join(" ")).replace(/\s+/g, " ").trim();
  return name || null;
}

function parseCustomerPhone(text: string): string | null {
  const match = text.match(/Telefoni:\s*([\d/\s.-]+)/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, "").trim() || null;
}

function parseAddress(text: string): string | null {
  const match = text.match(/Adresa\s*:\s*([\s\S]+?)(?:\n\s*Qyteti|\nQyteti)/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function parseCity(text: string): string | null {
  const match = text.match(/Qyteti:\s*([\s\S]+?)(?:\n\s*Telefoni|\nTelefoni)/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function cleanDestinationLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^adresa\s+primare$/i.test(line))
    .filter((line) => !/^I[''']?$/i.test(line));
}

function parseDestinationBlock(block?: string | null): ParsedDestination | null {
  if (!block?.trim()) return null;
  const trimmed = block.trim();

  const subAddress = trimmed.match(/Adresa\s*:?\s*([^\n]+)/i)?.[1]?.trim();
  const subCity = trimmed.match(/Qyteti\s*:?\s*([^\n]+)/i)?.[1]?.trim();
  const subPhone = trimmed.match(/Telefoni\s*:?\s*([^\n]+)/i)?.[1]?.trim();

  const lines = cleanDestinationLines(trimmed).filter(
    (line) => !/^(Adresa|Qyteti|Telefoni)\s*:?/i.test(line)
  );

  const hasLabeledFields = Boolean(subAddress || subCity || subPhone);
  let name: string | undefined;
  let address: string | undefined;
  let city: string | undefined;

  if (hasLabeledFields) {
    name = lines.join(" ").replace(/\s+/g, " ").trim() || undefined;
    address = subAddress ?? lines[1];
    city = subCity ?? lines[2]?.replace(/-KOSOVA/i, "").trim();
  } else if (lines.length >= 3) {
    name = lines[0];
    address = lines[1];
    city = lines[2].replace(/-KOSOVA/i, "").trim();
  } else if (lines.length === 2) {
    name = lines[0];
    address = lines[1];
  } else {
    name = lines.join(" ").replace(/\s+/g, " ").trim() || undefined;
  }

  if (!name && !address && !city && !subPhone) return null;

  return {
    name,
    address,
    city,
    phone: subPhone?.replace(/\s+/g, "").trim(),
  };
}

/** Fletë dërgese — buyer / invoice destination (replaces Blerësi on delivery notes). */
function parseFaturaDergohetNe(text: string): ParsedDestination | null {
  const match = text.match(
    /Fatura\s+dërgohet\s+në\s*:?\s*([\s\S]+?)(?=Emertimi|Normat\s+Tatimore|Telefoni:|$)/i
  );
  if (!match) return null;
  const block = match[1].replace(/^Malli\s+dërgohet\s+në\s*:?\s*/i, "").trim();
  return parseDestinationBlock(block);
}

/** Fletë dërgese — goods delivery destination when different from invoice address. */
function parseMalliDergohetNe(text: string): ParsedDestination | null {
  if (/adresa\s+primare/i.test(text)) return null;

  const match = text.match(
    /Malli\s+dërgohet\s+në\s*:?\s*([\s\S]+?)(?=Emertimi|Normat\s+Tatimore|Telefoni:|Fatura\s+dërgohet|$)/i
  );
  const dest = parseDestinationBlock(match?.[1]);
  if (!dest?.address && !dest?.city && !dest?.name) return null;
  return dest;
}

function parsePalletCount(text: string): number | null {
  const match = text.match(/\b(\d+)\s*PALET\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  return count > 0 ? count : null;
}

function normalizeAgimiInvoiceNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** @deprecated use normalizeAgimiInvoiceNumber */
function normalizeShvInvoiceNumber(raw: string): string {
  return normalizeAgimiInvoiceNumber(raw);
}

const AGIMI_INVOICE_COMPACT_RE =
  /\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/gi;

const AGIMI_INVOICE_SPLIT_RE =
  /(\d{2})\s*-\s*(SHV|SHF|PSV)\s*(\d)\s*[\s\n]+(\d)\s*-\s*(\d{3})\s*-\s*(\d{3,4})/gi;

export interface AgimiInvoiceTextSegment {
  invoiceNumber: string;
  text: string;
}

export interface AgimiInvoiceNumberAnchor {
  index: number;
  number: string;
}

/** All AGIMI document numbers in reading order (top-right barcode / header). */
export function findAgimiInvoiceNumberAnchors(text: string): AgimiInvoiceNumberAnchor[] {
  const normalized = normalizeOcrInvoiceText(normalizeInvoiceText(text));
  const anchors: AgimiInvoiceNumberAnchor[] = [];

  for (const match of normalized.matchAll(AGIMI_INVOICE_COMPACT_RE)) {
    const number = normalizeAgimiInvoiceNumber(match[1]);
    anchors.push({ index: match.index ?? 0, number });
  }

  for (const match of normalized.matchAll(AGIMI_INVOICE_SPLIT_RE)) {
    const number = normalizeAgimiInvoiceNumber(
      `${match[1]}-${match[2]}${match[3]}${match[4]}-${match[5]}-${match[6]}`
    );
    anchors.push({ index: match.index ?? 0, number });
  }

  anchors.sort((a, b) => a.index - b.index);

  const seenAtIndex = new Set<number>();
  return anchors.filter((anchor) => {
    if (seenAtIndex.has(anchor.index)) return false;
    seenAtIndex.add(anchor.index);
    return true;
  });
}

/** Split OCR/PDF text into one block per unique invoice number. */
export function splitTextByAgimiInvoiceNumbers(
  rawText: string
): AgimiInvoiceTextSegment[] {
  const normalized = normalizeOcrInvoiceText(normalizeInvoiceText(rawText));
  const anchors = findAgimiInvoiceNumberAnchors(normalized);

  if (anchors.length === 0) {
    return [
      {
        invoiceNumber: parseInvoiceNumber(normalized) ?? "",
        text: normalized,
      },
    ];
  }

  const uniqueOrder: string[] = [];
  const firstIndex = new Map<string, number>();
  for (const anchor of anchors) {
    if (!firstIndex.has(anchor.number)) {
      firstIndex.set(anchor.number, anchor.index);
      uniqueOrder.push(anchor.number);
    }
  }

  return uniqueOrder.map((invoiceNumber, idx) => {
    const start = firstIndex.get(invoiceNumber)!;
    const nextNumber = uniqueOrder[idx + 1];
    const end = nextNumber ? firstIndex.get(nextNumber)! : normalized.length;
    return {
      invoiceNumber,
      text: normalized.slice(start, end).trim(),
    };
  });
}

export function parseMultipleAgimiInvoices(rawText: string): ParsedAgimiInvoice[] {
  const segments = splitTextByAgimiInvoiceNumbers(rawText);
  return segments
    .map(({ invoiceNumber, text }) => {
      const parsed = parseAgimiInvoice(text);
      if (invoiceNumber) {
        parsed.invoiceNumber = invoiceNumber;
      }
      return parsed;
    })
    .filter((parsed, idx) => {
      const kind = detectAgimiDocumentKind(segments[idx].text);
      return Boolean(
        parsed.invoiceNumber ||
          parsed.customerName ||
          parsed.price > 0 ||
          parsed.items.some(
            (i) =>
              (i.quantityM2 ?? 0) > 0 ||
              (i.weightKg ?? 0) > 0 ||
              (i.manualPieces ?? 0) > 0
          ) ||
          kind === "delivery_note"
      );
    });
}

function parseInvoiceNumber(text: string): string | null {
  const anchors = findAgimiInvoiceNumberAnchors(text);
  if (anchors.length > 0) {
    return anchors[0].number;
  }

  const splitShv = text.match(
    /(\d{2})\s*-\s*SHV\s*(\d)\s*[\s\n]+(\d)\s*-\s*(\d{3})\s*-\s*(\d{4})/i
  );
  if (splitShv) {
    return `${splitShv[1]}-SHV${splitShv[2]}${splitShv[3]}-${splitShv[4]}-${splitShv[5]}`;
  }

  const compact = text.match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
  if (compact) {
    return normalizeAgimiInvoiceNumber(compact[1]);
  }

  const labeled = text.match(
    /(?:Nr\.?\s*fatur[ëe]?|Fatur[ëe])\s*[:#]?\s*([\d-]{8,})/i
  );
  if (labeled) return labeled[1].trim();

  return null;
}

function parseProductEan(text: string): string | null {
  const beforeSl = text.match(/\n(\d{10,13})\s*\n\s*SL\b/i);
  if (beforeSl) return beforeSl[1];

  const inline = text.match(/\b(\d{10,13})\b[\s\S]{0,40}?\bSL\b/i);
  return inline?.[1] ?? null;
}

function parseTotalPrice(text: string): number | null {
  const patterns = [
    /Vlera\s*per\s*pagese:\s*([\d.,]+)/gi,
    /Vlera\s*\n?\s*per\s*\n?\s*pagese:\s*([\d.,]+)/gi,
    /per\s*\n?\s*pagese:\s*([\d.,]+)/gi,
    /Mb\s*etja:\s*([\d.,]+)/gi,
  ];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    const last = matches.at(-1);
    if (last) return parseLocaleNumber(last[1]);
  }
  return null;
}

function parseQuantityKg(text: string): number | null {
  const lineQty = text.match(/\n([\d.,]+)\s*\n\s*TVSH\s*\n\s*[\d.,]+/i);
  if (lineQty) {
    const window = text.slice(
      Math.max(0, (lineQty.index ?? 0) - 120),
      (lineQty.index ?? 0) + lineQty[0].length + 40
    );
    if (/\bKG\b/i.test(window)) {
      const qty = parseLocaleNumber(lineQty[1]);
      if (qty > 0 && qty < 100000) return qty;
    }
  }

  const before = text.match(/([\d.,]+)\s*[\s\n]+KG\b/i);
  if (before) {
    const qty = parseLocaleNumber(before[1]);
    if (qty > 0 && qty < 100000) return qty;
  }

  const labeled = text.match(/\bKG\s*[\s\n]*([\d.,]+)/i);
  if (labeled) {
    const qty = parseLocaleNumber(labeled[1]);
    if (qty > 0 && qty < 100000) return qty;
  }

  return null;
}

function parseQuantityM2(text: string): number | null {
  // Line-item m² in AGIMI table: qty row sits above a TVSH tax row.
  const lineQty = text.match(/\n([\d.,]+)\s*\n\s*TVSH\s*\n\s*[\d.,]+/i);
  if (lineQty) {
    const qty = parseLocaleNumber(lineQty[1]);
    if (qty > 0 && qty < 10000) return qty;
  }

  const compact = text.match(/([\d.,]+)(M2)(?=[\d.,])/i);
  if (compact) {
    const qty = parseLocaleNumber(compact[1]);
    if (qty > 0 && qty < 10000) return qty;
  }

  const before = text.match(/([\d.,]+)\s*[\s\n]+M2\b/i);
  if (before) {
    const qty = parseLocaleNumber(before[1]);
    if (qty > 0 && qty < 10000) return qty;
  }

  const labeled = text.match(/\bM2\s*[\s\n]*([\d.,]+)/i);
  if (labeled) {
    const qty = parseLocaleNumber(labeled[1]);
    if (qty > 0 && qty < 10000) return qty;
  }

  return null;
}

function parseTileSize(text: string): { w: number; h: number } | null {
  const match = text.match(/(\d{2,3})\s*[xX×]\s*(\d{2,3})/);
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

function parseTileSizeFromName(name: string): { w: number; h: number } | null {
  const match = name.match(/(\d{2,3})\s*[xX×*]\s*(\d{2,3})/);
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

function isDocumentLabelLine(line: string): boolean {
  return /^(Flet[ëe]|Fatur[ëe]|FLET|FATUR|Malli|BLER|Bler|Adresa|Qyteti|Telefoni|Emertimi|Normat|Tatimore|Baza|TVSH|AGIMI|Centro|Ceramica|KOSOVA|DUA\s+T)/i.test(
    line.trim()
  );
}

function isProductNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^SL$/i.test(t)) return true;
  if (/^\d{1,2}$/.test(t)) return true;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) return true;
  if (/^Jti,?$/i.test(t)) return true;
  if (/^Normat$|^Tatimore$|^Baza$|^TVSH$/i.test(t)) return true;
  if (/^\d{8,12}$/.test(t)) return true;
  if (/^\d+\s*PALET\b/i.test(t)) return true;
  if (/^\d+\s*KG\b/i.test(t)) return true;
  if (/^\d{2}-\d{3}-[A-Z]{2}$/i.test(t)) return true;
  if (isDocumentLabelLine(t)) return true;
  return false;
}

function cleanProductNameFragment(raw: string): string {
  return raw
    .replace(/^[\s|;:i]+/, "")
    .replace(/\s+\d+[.,]\d{2}\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeProductTitleLine(line: string): boolean {
  const t = cleanProductNameFragment(line);
  if (t.length < 4 || t.length > 72) return false;
  if (looksLikeOcrGarbageLine(t)) return false;
  if (parseAgimiTableRowLine(line)) return false;
  if (/^\d+[.,]\d/.test(t)) return false;
  if (/^(No fiskal|Numri unik|Bleresi|Blerësi|Adresa|Qyteti|Telefoni|KORAL|AVNI|QYTETARET|Dentar|LIGA|FATON|Gly)/i.test(t)) {
    return false;
  }
  if (/(?:\d+[.,]\d{2}\s+){2,}/.test(t)) return false;
  if (/^(EC\.|PROFI|ARDEX|SILICON|FUG|VALENTIA|URBAN|BOTAN|DEC\.|MARMI)/i.test(t)) {
    return true;
  }
  if (/\d{2,3}\s*[xX×*]\s*\d{2,3}/.test(t) && /[A-Za-z]{4,}/.test(t)) return true;
  return /^[A-Z0-9][A-Z0-9.\s-]{4,}$/i.test(t) && /[A-Za-z]{4,}/.test(t);
}

function isProductNameContinuationLine(line: string): boolean {
  const t = cleanProductNameFragment(line);
  if (t.length < 3 || t.length > 64) return false;
  if (looksLikeOcrGarbageLine(t)) return false;
  if (parseAgimiTableRowLine(line)) return false;
  if (/^\d+\s+\d{3,13}\b/.test(t)) return false;
  if (/(?:\d+[.,]\d{2}\s+){2,}/.test(t)) return false;
  if (/^(Normat|TVSH|Vlera|ANTIQUE|CARVING|Rabati|Llogaria)/i.test(t)) return false;
  if (/^Batch\s*no\.?\s*:?\s*\S+/i.test(t)) return true;
  if (/^(KORAL|AVNI|QYTETARET|Dentar|LIGA|FATON|Gly|ee O|PROFI FLEX)/i.test(t)) {
    return false;
  }
  if (!/[A-Za-z]{3,}/.test(t)) return false;
  return true;
}

function shouldAttachPreTableTitle(rowName: string): boolean {
  const n = rowName.trim();
  if (/^(EC\.|PROFI|ARDEX|VALENTIA|DEC\.|BENZER|FUGAROK|SILICON|URBAN)/i.test(n)) {
    return false;
  }
  if (/^\d{2,4}\s*[xX×*]\s*\d/.test(n)) return true;
  if (/^[A-Z0-9]{2,4}\s*[xX×*]/.test(n)) return true;
  return n.length < 14;
}

function findPreTableProductTitle(lines: string[], tableStart: number): string | null {
  for (let i = tableStart - 1; i >= Math.max(0, tableStart - 2); i--) {
    const line = lines[i]?.replace(/^[\s|;:]+/, "").trim();
    if (!line) continue;
    if (looksLikeProductTitleLine(line)) {
      return cleanProductNameFragment(line);
    }
  }
  return null;
}

function shouldAttachSuffix(rowName: string): boolean {
  const n = rowName.trim();
  if (n.length < 6) return false;
  return !(
    /\d{2,3}\s*[xX×*]\s*\d{2,3}/.test(n) && n.length >= 10
  );
}

function sanitizeMergedProductName(name: string): string {
  let n = name.replace(/\s+/g, " ").trim();
  n = n.replace(/\s+\d+[.,]\d{2}(?=\s+[A-Z]|\s*$)/g, " ");
  n = n.replace(/\s*[!;|{}]+.*$/g, "");
  n = n.replace(/\s+(Llogaria|Bankare|IBAN|SWIFT|Programi|Rabati|TVSH|Vlera pa).*$/i, "");
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

function looksLikeFullTableProductName(raw: string): boolean {
  const n = sanitizeMergedProductName(raw).replace(/\s+/g, " ").trim();
  if (n.length < 8) return false;
  if (/^(?:QERAMIKA|AGIMI|Normat|TVSH|Bleresi|Blerësi)/i.test(n)) return false;
  if (/(?:\d+[.,]\d{2}\s+){2,}/.test(n)) return false;
  return /[A-Za-z]{2,}/.test(n);
}

function looksLikeCleanProductName(raw: string): boolean {
  const n = sanitizeMergedProductName(raw).replace(/\s+/g, " ").trim();
  if (n.length < 10) return false;
  if (!/\d{2,3}\s*[xX×*]\s*\d{2,3}[A-Z0-9]*/i.test(n)) return false;
  if (/^(?:QERAMIKA|AGIMI|Normat|TVSH|Bleresi|Blerësi)/i.test(n)) return false;
  if (/(?:\d+[.,]\d{2}\s+){2,}/.test(n)) return false;
  return /[A-Za-z]{2,}/.test(n);
}

function finalizeProductName(raw: string): string {
  const merged = sanitizeMergedProductName(raw);
  if (looksLikeCleanProductName(merged) || looksLikeFullTableProductName(merged)) {
    return merged.replace(/\s+/g, " ").trim();
  }
  return cleanEmertimiName(merged);
}

function sanitizeRowProductName(name: string): string {
  return finalizeProductName(name);
}

function mergeProductNameParts(parts: string[]): string {
  const cleaned = parts
    .map((part) => sanitizeMergedProductName(cleanProductNameFragment(part)))
    .filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return finalizeProductName(cleaned[0]);

  const rowPart = cleaned[cleaned.length - 1];
  const titlePart = cleaned.slice(0, -1).join(" ");

  if (rowPart.toUpperCase().includes(titlePart.toUpperCase().slice(0, 8))) {
    return finalizeProductName(rowPart);
  }
  if (titlePart.toUpperCase().includes(rowPart.toUpperCase())) {
    return finalizeProductName(titlePart);
  }
  return finalizeProductName(`${titlePart} ${rowPart}`);
}

function joinProductLines(lines: string[]): string {
  return mergeProductNameParts(
    lines.map((l) => l.trim()).filter((l) => l && !isProductNoiseLine(l))
  );
}

function looksLikeTileProductLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 8) return false;
  if (isProductNoiseLine(t)) return false;
  if (!/\d{2,3}\s*[xX×]\s*\d{2,3}/.test(t)) return false;
  if (!/[A-Za-z]{2,}/.test(t)) return false;
  if (/^Rr\.|^Nr\.|^Tel|^Fax|^\+?\d[\d\s/-]{6,}$/.test(t)) return false;
  return true;
}

function looksLikeTileProductPrefixLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  if (isProductNoiseLine(t)) return false;
  if (/\d{2,3}\s*[xX×]\s*\d{2,3}/.test(t)) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return true;
}

/** Find AGIMI tile SKU lines (e.g. EC. SOFT BESANA WHITE 100X100 ZG01) without Emertimi header. */
function parseProductNameFromCandidates(text: string): string | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  let best: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (!looksLikeTileProductLine(lines[i])) continue;

    const prefix: string[] = [];
    for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
      const prev = lines[j];
      if (looksLikeTileProductPrefixLine(prev)) prefix.unshift(prev);
      else break;
    }

    const candidate = [...prefix, lines[i]].join(" ").replace(/\s+/g, " ").trim();
    if (!best || candidate.length > best.length) best = candidate;
  }

  return best;
}

const EMERTIMI_BLOCK_END =
  /(?=\n\s*(?:Normat\s+Tatimore|TVSH\b|M2\b|\d+\s*PALET|Baza\b|Sasia\b|Total\b|Vlera\b|Cop[ëe]\b|Fatura\s+dërgohet|Malli\s+dërgohet|Bler[ëe]si\b|$))/i;

function parseProductName(
  text: string,
  productEan: string | null,
  sizeLabel: string | null
): string {
  const inlineEmertimi = text.match(
    /Emertimi\s*:?\s*([A-Z0-9][^\n]{5,})/i
  );
  if (inlineEmertimi) {
    const name = joinProductLines(inlineEmertimi[1].split("\n"));
    if (name.length >= 3 && looksLikeTileProductLine(name)) return name;
    if (name.length >= 3 && /\d{2,3}\s*[xX×]\s*\d{2,3}/.test(name)) return name;
  }

  const emertimiBlock = text.match(
    new RegExp(
      `Emertimi\\s*:?[\\s\\S]{0,8}?\\n([\\s\\S]+?)${EMERTIMI_BLOCK_END.source}`,
      "i"
    )
  );
  if (emertimiBlock) {
    const name = joinProductLines(emertimiBlock[1].split("\n"));
    if (name.length >= 3) return name;
  }

  const emertimiLoose = text.match(
    /Emertimi\s*[\s\S]{0,60}?\n([\s\S]+?)(?=\n\s*Normat\s+Tatimore|\nNormat\s+Tatimore)/i
  );
  if (emertimiLoose) {
    const name = joinProductLines(emertimiLoose[1].split("\n"));
    if (name.length >= 3) return name;
  }

  const anchor = productEan?.trim();
  if (anchor) {
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = text.match(
      new RegExp(
        `${escaped}[\\s\\S]{0,240}?(?=Normat\\s+Tatimore|TVSH\\s*\\n?\\s*e\\s+llogaritur|\\d+\\s*PALET|$)`,
        "i"
      )
    );
    if (block) {
      const afterAnchor = block[0].slice(anchor.length);
      const name = joinProductLines(afterAnchor.split("\n"));
      if (name.length >= 3) return name;
    }
  }

  const candidate = parseProductNameFromCandidates(text);
  if (candidate) return candidate;

  return sizeLabel ? `Tile ${sizeLabel}` : "Tile";
}

const AGIMI_TABLE_FOOTER_RE =
  /^(Normat\s+Tatimore|TVSH\b|Viera\s+pa\s+TVSH|Vlera\s+per\s+pagese|Vlera\s+para\s+zbritjes|Rabati\b|Pagesa\b|Mbetja\b|Llogaria\s+Bankare|IBAN\b|SWIFT\b|Faturoi|Dergoi|Pranoi|Pergatiti|Programi\b|Kujdes!)/i;

const AGIMI_TABLE_END_RE =
  /^(Normat\s+Tatimore|Viera\s+pa\s+TVSH|Vlera\s+per\s+pagese|Vlera\s+para\s+zbritjes)/i;

function isAgimiTableFooterLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (AGIMI_TABLE_FOOTER_RE.test(t)) return true;
  if (/^Viera\s/i.test(t)) return true;
  return false;
}

function isAgimiTableEndLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return AGIMI_TABLE_END_RE.test(t);
}

function parseAgimiLineQuantity(raw: string, unitToken: string): number {
  const trimmed = raw.trim();
  let qty = parseLocaleNumber(trimmed);
  if (unitToken === "M2" && /^\d+\.\d{3}$/.test(trimmed)) {
    qty = qty / 1000;
  }
  return qty;
}

const AGIMI_UNIT_PATTERN =
  "M2|KG|MTR|MET|Metër|Meter|M(?!2\\b)|PAKO|THAS|Copé|Copë|Cope|Cop[ée]";

function isPlausibleQuantityUnit(
  cleaned: string,
  match: RegExpMatchArray
): boolean {
  const unit = normalizeAgimiUnitToken(match[2]);
  const qty = parseAgimiLineQuantity(match[1], unit);
  const unitPos = (match.index ?? 0) + match[0].indexOf(match[2]) + match[2].length;
  const afterUnit = cleaned.slice(unitPos).trim();
  const next = afterUnit.match(/^([\d.,]+)/);
  if (!next) return true;

  const nextVal = parseLocaleNumber(next[1]);
  if (unit === "KG" && qty > 150 && nextVal > 0 && nextVal < qty / 2) {
    return false;
  }
  if (unit === "M2" && qty > 1000 && nextVal > 0 && nextVal < 100) {
    return false;
  }
  return true;
}

function extractAgimiRowTail(trimmed: string): RegExpMatchArray | null {
  const cleaned = trimmed.replace(/\s+/g, " ");
  const unit = AGIMI_UNIT_PATTERN;
  const qty =
    "\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?";

  const compactTail = cleaned.match(
    new RegExp(
      `^(${qty})(M2|KG|MTR|MET|Metër|Meter|M(?!2)|PAKO|THAS|Copé|Copë|Cope)(?=[\\d.,])`,
      "i"
    )
  );
  if (compactTail) {
    const synthetic = [
      compactTail[0],
      compactTail[1],
      compactTail[2],
    ] as unknown as RegExpMatchArray;
    synthetic.index = 0;
    if (isPlausibleQuantityUnit(cleaned, synthetic)) return synthetic;
  }

  const fullPattern = new RegExp(
    `(${qty})\\s*(?:_)?(${unit})\\s+(?:[\\d.,]+\\s+){2,}[\\d.,]+(?:\\s*\\.\\s*)?(?:\\|\\s*)?$`,
    "gi"
  );

  const matches = [...cleaned.matchAll(fullPattern)];
  for (let i = matches.length - 1; i >= 0; i--) {
    if (isPlausibleQuantityUnit(cleaned, matches[i])) return matches[i];
  }

  const tailPrices = cleaned.match(
    /\s([\d.,]+)\s+0\.00\s+0\.00\s+([\d.,]+)\s+([\d.,]+)\s*$/i
  );
  if (tailPrices && tailPrices.index != null) {
    const unitTokens = [...cleaned.matchAll(new RegExp(`\\b(${unit})\\b`, "gi"))];
    const unitToken = unitTokens.at(-1)?.[1] ?? "KG";
    const synthetic = [
      tailPrices[0],
      tailPrices[1],
      unitToken,
    ] as unknown as RegExpMatchArray;
    synthetic.index = tailPrices.index;
    if (isPlausibleQuantityUnit(cleaned, synthetic)) return synthetic;
  }

  if (matches.length > 0) return matches[matches.length - 1];

  const minimalPattern = new RegExp(
    `(${qty})\\s*(?:_)?(${unit})\\s+[\\d.,]+\\s*$`,
    "gi"
  );
  const minimal = [...cleaned.matchAll(minimalPattern)];
  for (let i = minimal.length - 1; i >= 0; i--) {
    if (isPlausibleQuantityUnit(cleaned, minimal[i])) return minimal[i];
  }
  return minimal.at(-1) ?? null;
}

function parseAgimiTableRowHead(
  beforeTail: string
): { lineNumber?: string; ean: string; name: string } | null {
  const trimmed = beforeTail.replace(/^[\s|;:]+/, "").trim();
  if (!trimmed) return null;

  const standard = trimmed.match(
    /^(?:\(\)\s*)?(?:(\d{1,2})\s*[=:]?\s+)?(\d{7,13})\s+(.*)$/i
  );
  if (standard?.[3]?.trim()) {
    return {
      lineNumber: standard[1],
      ean: standard[2],
      name: stripTrailingPriceFromName(standard[3]),
    };
  }

  const shortBarcode = trimmed.match(
    /^(?:\(\)\s*)?(?:(\d{1,2})\s*[=:]?\s+)?(\d{3,6})\s+(.*)$/i
  );
  if (shortBarcode?.[3]?.trim()) {
    return {
      lineNumber: shortBarcode[1],
      ean: shortBarcode[2],
      name: stripTrailingPriceFromName(shortBarcode[3]),
    };
  }

  const shortEan = trimmed.match(/^(?:\(\)\s*)?(\d{1,2})\s+(\d{1,4})\s+(.*)$/i);
  if (shortEan?.[3]?.trim() && Number(shortEan[2]) < 10000) {
    return {
      lineNumber: shortEan[1],
      ean: shortEan[2],
      name: stripTrailingPriceFromName(shortEan[3]),
    };
  }

  const missingLine = trimmed.match(/^(?:\(\)\s*)?(\d{3,4})\s+(.+)$/i);
  if (missingLine?.[2]?.trim()) {
    return {
      ean: missingLine[1],
      name: stripTrailingPriceFromName(missingLine[2]),
    };
  }

  return null;
}

function stripTrailingPriceFromName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(
      /\s+\d+[.,]\d+\s*(?:M2|KG|PAKO|THAS|Cop[ée]?|Cope)\b[\d.,\s]*$/i,
      ""
    )
    .replace(/\s+(?:\d+[.,]\d+\s+){2,}\d+[.,]?\d*\s*$/i, "")
    .replace(/\s+[\d.,]+\s*$/, "")
    .trim();
}

/** Keep Emërtimi only — drop OCR junk, prices, units, and header bleed. */
function cleanEmertimiName(raw: string): string {
  let n = stripTrailingPriceFromName(raw);
  n = n.replace(/[©®™]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return "";

  const anchor = n.search(
    /\b(?:EC\.|PROFI\.?|ARDEX|VALENTIA|DEC\.|FUGAROK|BENZER|URBAN|BOTAN|SILICON|FUGAROK|MARMI|Nivelizues|KABINE)/i
  );
  if (anchor > 0) n = n.slice(anchor);

  const tokens = n.split(/\s+/).filter((token) => {
    const t = token.trim();
    if (!t) return false;
    if (/^\d+[.,]\d+$/.test(t)) return false;
    if (/^(M2|KG|PAKO|THAS|Cop[ée]?|Cope)$/i.test(t)) return false;
    if (/^\d{2,4}[xX×*]\d{2,4}[A-Z0-9]*$/i.test(t)) return true;
    if (/^[A-Z0-9]{2,6}$/i.test(t) && /\d/.test(t)) return true;
    if (/^EC\.[A-Z0-9]/i.test(t)) return true;
    if (/^EC\.$/i.test(t)) return true;
    if (/^[A-Z0-9][A-Z0-9.\-]{2,}$/.test(t) && /[AEIOUY]/.test(t) && /^[A-Z0-9.\-]+$/.test(t)) {
      return t.length >= 5 || /^(WHITE|GREY|GRAY|MATT|GLOSS|BEES|NAT|SOFT|FLEX|ROCK|SAND|SNOW)$/i.test(t);
    }
    if (/^[A-Z][a-z]{2,}$/.test(t)) return false;
    if (/^[A-Za-z]{1,3}$/.test(t)) return false;
    if (/^[A-Z]{2,4}$/.test(t) && !/[AEIOUY]{2,}/.test(t)) return false;
    return false;
  });

  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

interface ParsedAgimiTableRow {
  lineIndex: number;
  lineNumber?: string;
  ean: string;
  name: string;
  quantity: number;
  unitToken: string;
}

function normalizeAgimiUnitToken(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "m2") return "M2";
  if (t === "kg") return "KG";
  if (t === "pako") return "PAKO";
  if (t === "thas") return "THAS";
  if (t.startsWith("cop")) return "COPE";
  if (t === "m" || t === "mtr" || t === "met" || t === "meter" || t === "metër") {
    return "METER";
  }
  return raw.toUpperCase();
}

function parseAgimiTableRowLine(line: string): Omit<ParsedAgimiTableRow, "lineIndex"> | null {
  const trimmed = line.replace(/^[\s|;:]+/, "").trim();
  if (!trimmed || isProductNoiseLine(trimmed) || isAgimiTableFooterLine(trimmed)) {
    return null;
  }
  if (/\d{2}-(?:SHV|SHF|PSV)\d/i.test(trimmed)) return null;

  const tail = extractAgimiRowTail(trimmed);
  if (!tail || tail.index == null) return null;

  const beforeTail = trimmed.slice(0, tail.index).trim();
  const head = parseAgimiTableRowHead(beforeTail);
  if (!head) return null;

  const name = head.name.replace(/\s+/g, " ").trim();
  if (name.length < 1) return null;
  if (/^(?:QERAMIKA|AGIMI|Add:|NUI:|Nr\.\s*TVSH|tel:|e-mail:)/i.test(name)) {
    return null;
  }

  const unitToken = normalizeAgimiUnitToken(tail[2]);

  return {
    lineNumber: head.lineNumber,
    ean: head.ean,
    name: sanitizeRowProductName(name),
    quantity: parseAgimiLineQuantity(tail[1], unitToken),
    unitToken,
  };
}

function isAgimiTableContinuationLine(line: string): boolean {
  const trimmed = line.replace(/^[\s|;:]+/, "").trim();
  if (!trimmed || isProductNoiseLine(trimmed) || isAgimiTableFooterLine(trimmed)) {
    return false;
  }
  if (parseAgimiTableRowLine(trimmed)) return false;
  if (/^\d{1,2}\s+\d{3,13}\b/.test(trimmed)) return false;
  if (/^(?:\(\)\s*)?\d{3,13}\b/.test(trimmed)) return false;
  if (/\d{2}-(?:SHV|SHF|PSV)\d/i.test(trimmed)) return false;
  if (/^(?:QERAMIKA|AGIMI|Add:|NUI:|Nr\.\s*TVSH|tel:|e-mail:|Bleresi|\/\s*QERAMIKA)/i.test(trimmed)) {
    return false;
  }
  if (/^\d{2}\.\d{2}\.\d{4}/.test(trimmed)) return false;
  if (/^KTHEHET\b|^Programi\b|^Llogaria\b|^IBAN\b|^SWIFT\b|^Bees\b/i.test(trimmed)) {
    return false;
  }
  if (/\b812215524\b|\b330622218\b|SHKABAJ|PRISHTINE|info@agimi/i.test(trimmed)) {
    return false;
  }
  return /[A-Za-z]{2,}/.test(trimmed);
}

function collectPreTableProductLines(lines: string[], tableStart: number): string[] {
  const title = findPreTableProductTitle(lines, tableStart);
  return title ? [title] : [];
}

function tableRowToOrderItem(row: ParsedAgimiTableRow): OrderItemPayload {
  const productName = row.name.replace(/\s+/g, " ").trim();
  const productEan = row.ean?.trim() || undefined;
  const tileSize = parseTileSizeFromName(productName);

  if (row.unitToken === "M2") {
    return {
      unit: "m2",
      productName,
      productEan,
      ...(tileSize
        ? { tileWidthCm: tileSize.w, tileHeightCm: tileSize.h }
        : {}),
      quantityM2: row.quantity,
    };
  }

  if (row.unitToken === "KG") {
    return {
      unit: "kg",
      productName,
      productEan,
      weightKg: row.quantity,
    };
  }

  if (row.unitToken === "METER") {
    return {
      unit: "meter",
      productName,
      productEan,
      lengthM: row.quantity,
    };
  }

  return {
    unit: "piece",
    productName,
    productEan,
    manualPieces: Math.round(row.quantity * 100) / 100,
  };
}

const AGIMI_COMPACT_ROW_HEAD_RE = /^(\d{1,2})(1300\d{6})$/;
const PRODATA_PDF_ROW_HEAD_RE = /^(\d{1,2})(\d{7,13})$/;
const SPACED_TABLE_ROW_HEAD_RE = /^(\d{1,2})\s*[=:]?\s*(\d{7,13})$/;
const EAN_ONLY_LINE_RE = /^(\d{7,13})$/;
const ROW_NUMBER_ONLY_RE = /^(\d{1,2})$/;
const QTY_ONLY_LINE_RE = /^([\d.,]+)$/;
const UNIT_ONLY_LINE_RE = /^(M2|KG|MTR|MET|Metër|Meter|M(?!2)|PAKO|THAS|Copé|Copë|Cope)$/i;

function isAgimiProductTableHeader(line: string): boolean {
  const t = line.trim();
  return (
    /^No\.?\s*(?:Kodi|Barkodi|Emertimi)/i.test(t) ||
    /NoKodiEmertimi/i.test(t) ||
    /(?:^|\s)Kodi\s+Emertimi\s+Sasia/i.test(t) ||
    /Emertimi\s+Sasia\s+Njesia/i.test(t) ||
    /No\s+Kodi\s+Emertimi\s+Sasia\s+Njesia/i.test(t)
  );
}

function matchTableRowHeadLine(line: string): { lineNumber: string; ean: string; nameStart?: string } | null {
  const trimmed = line.replace(/^[\s|;:=]+/, "").trim();

  const agimiCompact = trimmed.match(AGIMI_COMPACT_ROW_HEAD_RE);
  if (agimiCompact) {
    return { lineNumber: agimiCompact[1], ean: agimiCompact[2] };
  }

  let match = trimmed.match(PRODATA_PDF_ROW_HEAD_RE);
  if (match) return { lineNumber: match[1], ean: match[2] };
  match = trimmed.match(SPACED_TABLE_ROW_HEAD_RE);
  if (match) return { lineNumber: match[1], ean: match[2] };

  const inline = trimmed.match(/^(\d{1,2})\s*[=:]?\s*(\d{7,13})\s+(.+)$/i);
  if (inline?.[3]?.trim()) {
    return {
      lineNumber: inline[1],
      ean: inline[2],
      nameStart: inline[3].trim(),
    };
  }

  return null;
}

function extractQtyUnitFromLines(
  line: string,
  nextLine?: string
): { quantity: number; unitToken: string } | null {
  const inlineTail = parseProDataPdfRowTail(line) ?? parseInlineQtyUnitTail(line);
  if (inlineTail) return inlineTail;

  const trimmed = line.trim();
  const qtyMatch = trimmed.match(QTY_ONLY_LINE_RE);
  if (qtyMatch && nextLine) {
    const unitMatch = nextLine.trim().match(UNIT_ONLY_LINE_RE);
    if (unitMatch) {
      const unitToken = normalizeAgimiUnitToken(unitMatch[1]);
      return {
        quantity: parseAgimiLineQuantity(qtyMatch[1], unitToken),
        unitToken,
      };
    }
  }

  return null;
}

function parseInlineQtyUnitTail(line: string): { quantity: number; unitToken: string } | null {
  const match = line
    .trim()
    .match(
      /\b([\d.,]+)\s*(?:_)?(M2|KG|MTR|MET|Metër|Meter|M(?!2)|PAKO|THAS|Copé|Copë|Cope)\b/i
    );
  if (!match) return null;
  const unitToken = normalizeAgimiUnitToken(match[2]);
  return {
    quantity: parseAgimiLineQuantity(match[1], unitToken),
    unitToken,
  };
}

function findAgimiProductTableBounds(lines: string[]): { start: number; end: number } {
  let headerIdx = lines.findIndex((line) => isAgimiProductTableHeader(line.trim()));
  if (headerIdx < 0) {
    headerIdx = lines.findIndex(
      (line) =>
        /^No\.?\s*(?:Kodi|Barkodi|Emertimi)/i.test(line.trim()) ||
        /NoKodiEmertimi/i.test(line.trim())
    );
  }

  let start = headerIdx >= 0 ? headerIdx + 1 : -1;
  if (start < 0) {
    start = lines.findIndex(
      (line) =>
        parseAgimiTableRowLine(line) !== null || matchTableRowHeadLine(line) !== null
    );
  }
  if (start < 0) start = 0;

  const end = lines.findIndex(
    (line, idx) =>
      idx > start && isAgimiTableEndLine(line.replace(/^[\s|;:]+/, "").trim())
  );

  return { start, end: end >= 0 ? end : lines.length };
}

/** OCR often splits No / Kodi / Emertimi / Sasia / Njesia into separate lines per row. */
function parseAgimiColumnarTableLineItems(text: string): OrderItemPayload[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[\s|;:]+/, "").trim());

  const { start, end } = findAgimiProductTableBounds(lines);
  const tableLines = lines.slice(start, end);
  const rows: ParsedAgimiTableRow[] = [];

  for (let i = 0; i < tableLines.length; i++) {
    const line = tableLines[i];
    if (!line || isAgimiTableFooterLine(line)) continue;

    const inlineRow = parseAgimiTableRowLine(line);
    if (inlineRow) {
      rows.push({ lineIndex: i, ...inlineRow });
      continue;
    }

    let lineNumber: string | undefined;
    let ean: string | undefined;
    const nameParts: string[] = [];
    let cursor = i;

    if (ROW_NUMBER_ONLY_RE.test(line)) {
      lineNumber = line;
      cursor += 1;
    }

    const current = tableLines[cursor];
    if (!current) continue;

    const head = matchTableRowHeadLine(current);
    if (head) {
      lineNumber = head.lineNumber;
      ean = head.ean;
      if (head.nameStart) nameParts.push(head.nameStart);
      cursor += 1;
    } else if (EAN_ONLY_LINE_RE.test(current)) {
      ean = current;
      cursor += 1;
    } else {
      continue;
    }

    if (!ean) continue;

    let quantity = 0;
    let unitToken = "M2";

    for (; cursor < tableLines.length; cursor++) {
      const part = tableLines[cursor];
      if (!part) continue;
      if (isAgimiTableFooterLine(part)) break;
      if (matchTableRowHeadLine(part) || ROW_NUMBER_ONLY_RE.test(part)) break;

      const inline = parseAgimiTableRowLine(part);
      if (inline && inline.ean === ean) {
        quantity = inline.quantity;
        unitToken = inline.unitToken;
        if (inline.name) nameParts.push(inline.name);
        cursor += 1;
        break;
      }

      const qtyUnit = extractQtyUnitFromLines(part, tableLines[cursor + 1]);
      if (qtyUnit) {
        quantity = qtyUnit.quantity;
        unitToken = qtyUnit.unitToken;
        cursor += tableLines[cursor + 1]?.match(UNIT_ONLY_LINE_RE) ? 2 : 1;
        break;
      }

      if (/^(?:\d+[.,]\d+\s+){2,}/.test(part)) break;
      nameParts.push(part);
    }

    if (quantity <= 0) continue;

    rows.push({
      lineIndex: i,
      lineNumber,
      ean,
      name: mergeProductNameParts(nameParts),
      quantity,
      unitToken,
    });

    i = Math.max(i, cursor - 1);
  }

  return rows.map(tableRowToOrderItem);
}

function countProductRowHeadsInText(text: string): number {
  let count = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^[\s|;:]+/, "").trim();
    if (!line || isProductNoiseLine(line) || isAgimiTableFooterLine(line)) continue;
    if (matchTableRowHeadLine(line)) {
      count++;
      continue;
    }
    if (/^\d{1,2}\s+\d{7,13}\b/.test(line)) count++;
    else if (parseAgimiTableRowLine(rawLine)) count++;
  }
  return count;
}

function dedupeOrderItems(items: OrderItemPayload[]): OrderItemPayload[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = [
      item.productEan ?? "",
      item.productName ?? "",
      item.unit,
      item.quantityM2 ?? "",
      item.weightKg ?? "",
      item.lengthM ?? "",
      item.manualPieces ?? "",
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isProDataPdfRowTailLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[\d.,]+(?:M2(?=[\d.,])|KG(?=[\d.,])|MTR(?=[\d.,])|MET(?=[\d.,])|Metër(?=[\d.,])|Meter(?=[\d.,])|M(?!2)(?=[\d.,])|PAKO(?=[\d.,])|THAS(?=[\d.,])|Cop[ée](?=[\d.,])|Cope(?=[\d.,]))/i.test(
    trimmed
  );
}

function parseProDataPdfRowTail(line: string): { quantity: number; unitToken: string } | null {
  const match = line
    .trim()
    .match(
      /^([\d.,]+)(M2|KG|MTR|MET|Metër|Meter|M(?!2)|PAKO|THAS|Copé|Copë|Cope)(?=[\d.,])/i
    );
  if (!match) return null;
  const unitToken = normalizeAgimiUnitToken(match[2]);
  return {
    quantity: parseAgimiLineQuantity(match[1], unitToken),
    unitToken,
  };
}

function isProDataPdfTableLine(line: string): boolean {
  return (
    matchTableRowHeadLine(line) !== null ||
    isProDataPdfRowTailLine(line) ||
    isAgimiProductTableHeader(line) ||
    /No\.?\s*(?:Kodi|Barkodi|Emertimi)/i.test(line) ||
    /NoKodiEmertimi/i.test(line)
  );
}

/** Pro-Data PDF exports often split table rows across lines without spaces. */
function parseProDataPdfTableLineItems(text: string): OrderItemPayload[] {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[\s|;:]+/, "").trim())
    .filter(Boolean);

  if (!lines.some(isProDataPdfTableLine)) return [];

  let start = lines.findIndex((line) =>
    /No\.?\s*(?:Kodi|Barkodi|Emertimi)/i.test(line)
  );
  if (start >= 0) {
    const firstRow = lines.findIndex(
      (line, idx) => idx > start && matchTableRowHeadLine(line)
    );
    start = firstRow;
  }
  if (start < 0) {
    start = lines.findIndex((line) => /NoKodiEmertimi/i.test(line));
    if (start >= 0) {
      const firstRow = lines.findIndex(
        (line, idx) => idx > start && matchTableRowHeadLine(line)
      );
      start = firstRow;
    }
  }
  if (start < 0) {
    start = lines.findIndex((line) => matchTableRowHeadLine(line));
  }
  if (start < 0) return [];

  const end = lines.findIndex(
    (line, idx) =>
      idx > start &&
      /^(?:Vlera para zbritjes|Normat Tatimore|Vlera per pagese)/i.test(line)
  );
  const tableLines = lines.slice(start, end >= 0 ? end : lines.length);
  const rows: ParsedAgimiTableRow[] = [];

  for (let i = 0; i < tableLines.length; i++) {
    const head = matchTableRowHeadLine(tableLines[i]);
    if (!head) continue;

    const nameParts: string[] = [];
    let quantity = 0;
    let unitToken = "M2";
    let j = i + 1;

    for (; j < tableLines.length; j++) {
      const line = tableLines[j];
      if (matchTableRowHeadLine(line)) break;

      const tail = extractQtyUnitFromLines(line, tableLines[j + 1]);
      if (tail) {
        unitToken = tail.unitToken;
        quantity = tail.quantity;
        j += tableLines[j + 1]?.match(UNIT_ONLY_LINE_RE) ? 2 : 1;
        break;
      }

      const inlineRow = parseAgimiTableRowLine(line);
      if (inlineRow) {
        rows.push({
          lineIndex: i,
          lineNumber: head.lineNumber,
          ean: head.ean,
          name: mergeProductNameParts([...nameParts, inlineRow.name]),
          quantity: inlineRow.quantity,
          unitToken: inlineRow.unitToken,
        });
        i = j;
        quantity = 0;
        break;
      }

      if (isAgimiTableFooterLine(line) || isProductNoiseLine(line)) continue;
      nameParts.push(line);
    }

    if (quantity <= 0) continue;
    if (nameParts.length === 0) continue;

    rows.push({
      lineIndex: i,
      lineNumber: head.lineNumber,
      ean: head.ean,
      name: mergeProductNameParts(nameParts),
      quantity,
      unitToken,
    });

    i = j - 1;
  }

  return rows.map(tableRowToOrderItem);
}

function findAgimiTableStartLine(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isAgimiProductTableHeader(lines[i].trim())) {
      for (let j = i + 1; j < lines.length; j++) {
        if (parseAgimiTableRowLine(lines[j]) || matchTableRowHeadLine(lines[j])) {
          return j;
        }
      }
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (parseAgimiTableRowLine(lines[i]) || matchTableRowHeadLine(lines[i])) {
      return i;
    }
  }
  return 0;
}

/** Parse AGIMI product table rows on single lines (qty + unit + prices on same line). */
function parseAgimiStandardTableLineItems(text: string): OrderItemPayload[] {
  const lines = text.split("\n").map((line) => line.replace(/\r/g, ""));
  const tableStart = findAgimiTableStartLine(lines);
  const preTablePrefixes = collectPreTableProductLines(lines, tableStart);
  const tableEnd = lines.findIndex(
    (line, idx) =>
      idx > tableStart &&
      isAgimiTableEndLine(line.replace(/^[\s|;:]+/, "").trim())
  );
  const scanLines =
    tableEnd >= 0 ? lines.slice(tableStart, tableEnd) : lines.slice(tableStart);

  const rows: ParsedAgimiTableRow[] = [];
  for (let i = 0; i < scanLines.length; i++) {
    const parsed = parseAgimiTableRowLine(scanLines[i]);
    if (!parsed) continue;
    rows.push({ lineIndex: i, ...parsed });
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const nextRowStart =
      r + 1 < rows.length ? rows[r + 1].lineIndex : scanLines.length;

    const parts = [row.name];

    if (r === 0 && preTablePrefixes[0] && shouldAttachPreTableTitle(row.name)) {
      parts.unshift(preTablePrefixes[0]);
    }

    let suffixCount = 0;
    if (shouldAttachSuffix(row.name)) {
      for (let i = row.lineIndex + 1; i < nextRowStart && suffixCount < 3; i++) {
        const line = scanLines[i]?.replace(/^[\s|;:]+/, "").trim();
        if (!line || !isProductNameContinuationLine(line)) continue;
        parts.push(line);
        suffixCount++;
      }
    }

    row.name = mergeProductNameParts(parts);
  }

  return rows.map(tableRowToOrderItem);
}

/** Parse AGIMI pro-forma / faturë product table — one order line per row. */
export function parseAgimiTableLineItems(text: string): OrderItemPayload[] {
  const strategies = [
    parseAgimiStandardTableLineItems(text),
    parseProDataPdfTableLineItems(text),
    parseAgimiColumnarTableLineItems(text),
  ];

  const best = strategies.reduce(
    (winner, items) => (items.length > winner.length ? items : winner),
    [] as OrderItemPayload[]
  );

  return dedupeOrderItems(best);
}

function resolveDeliveryLocation(cityRaw: string, address: string): {
  region: string;
  city: string;
  location: string;
  locationId?: string;
  lat?: number;
  lng?: number;
} {
  const cityClean = cityRaw
    .replace(/-KOSOVA/i, "")
    .replace(/,.*$/, "")
    .trim();

  let loc: LocationEntry | null =
    resolveLocation(cityClean) ?? resolveLocation(cityRaw);

  if (!loc && /mitrovic/i.test(cityRaw)) {
    loc = resolveLocation("Mitrovicë");
  }

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

export function parseAgimiInvoice(rawText: string): ParsedAgimiInvoice {
  const text = normalizeOcrInvoiceText(normalizeInvoiceText(rawText));
  const warnings: string[] = [];
  const invoiceNumber = parseInvoiceNumber(text);
  let documentKind =
    documentKindFromInvoiceNumber(invoiceNumber) ??
    detectAgimiDocumentKind(text);
  const salesAgent = parseSalesAgent(text);
  const productEan = parseProductEan(text);
  const orderDate = parseInvoiceDate(text);
  const price = parseTotalPrice(text);
  const quantityM2 = parseQuantityM2(text);
  const quantityKg = parseQuantityKg(text);
  const tileSize = parseTileSize(text);
  const sizeLabel = tileSize ? `${tileSize.w}×${tileSize.h}` : null;
  const palletCount = parsePalletCount(text);

  let customerName: string | null = null;
  let address = "";
  let cityRaw = "";
  let phoneMatch: string | null = null;

  if (documentKind === "delivery_note") {
    const invoiceDestination = parseFaturaDergohetNe(text);
    const goodsDestination = parseMalliDergohetNe(text);
    const usePrimaryAddress =
      /adresa\s+primare/i.test(text) || !goodsDestination;

    customerName = invoiceDestination?.name ?? parseCustomerName(text);
    const deliveryDestination = usePrimaryAddress
      ? invoiceDestination
      : goodsDestination ?? invoiceDestination;

    address =
      deliveryDestination?.address ??
      invoiceDestination?.address ??
      parseAddress(text) ??
      "";
    cityRaw =
      deliveryDestination?.city ??
      invoiceDestination?.city ??
      parseCity(text) ??
      "";
    phoneMatch =
      deliveryDestination?.phone ??
      invoiceDestination?.phone ??
      parseCustomerPhone(text);

    if (usePrimaryAddress && invoiceDestination) {
      warnings.push(
        "Adresa primare — delivery matches the invoice destination (Fatura dërgohet në)."
      );
    } else if (goodsDestination) {
      warnings.push(
        "Delivery address taken from Malli dërgohet në (different from invoice destination)."
      );
    }

    if (price == null) {
      warnings.push(
        "Fletë dërgese — no invoice total on document (goods sent without direct payment)."
      );
    }
  } else {
    customerName = parseCustomerName(text);
    address = parseAddress(text) ?? "";
    cityRaw = parseCity(text) ?? "";
    phoneMatch = parseCustomerPhone(text);

    if (documentKind === "service_sheet") {
      warnings.push(
        "Internal warehouse form detected — confirm buyer and delivery details manually."
      );
    }
  }

  if (!invoiceNumber) warnings.push("Could not read invoice number — enter manually.");
  if (!salesAgent) {
    warnings.push("Could not read Referenti Juaj (sales agent) — enter manually if needed.");
  }
  if (!customerName) {
    warnings.push(
      documentKind === "delivery_note"
        ? "Could not read buyer from Fatura dërgohet në — enter manually."
        : "Could not read customer name — enter manually."
    );
  }
  if (!orderDate) warnings.push("Could not read invoice date — using today.");
  if (price == null && documentKind !== "delivery_note") {
    warnings.push("Could not read total price — enter manually.");
  }
  if (quantityM2 == null && quantityKg == null && palletCount == null) {
    warnings.push("Could not read quantity — enter manually.");
  } else if (quantityM2 == null && quantityKg == null && palletCount != null) {
    warnings.push(`Read ${palletCount} pallet(s) — enter m² on the form if needed.`);
  }

  const locationFields = cityRaw
    ? resolveDeliveryLocation(cityRaw, address)
    : {
        region: "",
        city: "",
        location: address || "—",
      };

  if (!cityRaw) {
    if (documentKind === "sales_invoice" || documentKind === "pro_forma") {
      warnings.push(
        "No delivery address on document — add location on the form if needed."
      );
    } else {
      warnings.push("Could not read delivery city — select region on the form.");
    }
  } else if (!locationFields.lat) {
    warnings.push(
      `City "${cityRaw}" mapped to ${locationFields.region} — confirm delivery location on map.`
    );
  }

  const fiscalMatch = text.match(/No fiskal:\s*(\d+)/i);

  const tableItems = parseAgimiTableLineItems(text);
  const productName = parseProductName(text, productEan, sizeLabel);
  const productTileSize = parseTileSizeFromName(productName) ?? tileSize;

  const items: OrderItemPayload[] = [];
  if (tableItems.length > 0) {
    items.push(...tableItems);
    if (tableItems.some((item) => item.unit === "m2" && !parseTileSizeFromName(item.productName ?? ""))) {
      warnings.push("Some tile lines missing size in name — confirm dimensions.");
    }
    if (
      tableItems.some(
        (item) =>
          item.unit === "kg" &&
          item.productName &&
          !parseUnitWeightKgFromName(item.productName)
      )
    ) {
      warnings.push(
        "Some kg lines missing pack weight in name (e.g. 25 kg) — confirm piece counts."
      );
    }
  } else if (quantityM2 != null && productTileSize) {
    items.push({
      unit: "m2",
      productName,
      productEan: productEan ?? undefined,
      tileWidthCm: productTileSize.w,
      tileHeightCm: productTileSize.h,
      quantityM2: quantityM2,
    });
  } else if (quantityM2 != null) {
    items.push({
      unit: "m2",
      productName,
      productEan: productEan ?? undefined,
      tileWidthCm: 60,
      tileHeightCm: 120,
      quantityM2: quantityM2,
    });
    warnings.push("Tile size not found — defaulting to 60×120 cm.");
  } else if (quantityKg != null && productName) {
    items.push({
      unit: "kg",
      productName,
      productEan: productEan ?? undefined,
      weightKg: quantityKg,
    });
    if (!parseUnitWeightKgFromName(productName)) {
      warnings.push(
        "Unit weight not found in product name (e.g. 25 kg) — enter pieces manually."
      );
    }
  } else if (productTileSize && productName && !/^Tile(\s|$)/i.test(productName)) {
    items.push({
      unit: "m2",
      productName,
      productEan: productEan ?? undefined,
      tileWidthCm: productTileSize.w,
      tileHeightCm: productTileSize.h,
      quantityM2: 0,
    });
  }

  return {
    documentKind,
    invoiceNumber: invoiceNumber ?? "",
    salesAgent: salesAgent ?? undefined,
    customerName: customerName ?? "",
    address,
    city: locationFields.city,
    region: locationFields.region,
    locationId: locationFields.locationId,
    lat: locationFields.lat,
    lng: locationFields.lng,
    orderDate: orderDate ?? new Date().toISOString().slice(0, 10),
    price: price ?? 0,
    customerPhone: phoneMatch ?? undefined,
    fiscalNumber: fiscalMatch?.[1],
    items: items.length > 0
      ? items
      : productName && !/^Tile(\s|$)/i.test(productName)
        ? [
            {
              unit: "m2" as const,
              productName,
              productEan: productEan ?? undefined,
              tileWidthCm: productTileSize?.w ?? 60,
              tileHeightCm: productTileSize?.h ?? 120,
              quantityM2: 0,
            },
          ]
        : [{ unit: "m2" as OrderUnit, quantityM2: 0 }],
    warnings,
  };
}

export function parsedInvoiceToOrderPayload(
  parsed: ParsedAgimiInvoice
): OrderPayload {
  const notes = [
    parsed.salesAgent ? `Referenti: ${parsed.salesAgent}` : null,
    parsed.customerPhone ? `Phone: ${parsed.customerPhone}` : null,
    parsed.fiscalNumber ? `Fiscal no: ${parsed.fiscalNumber}` : null,
    `Imported from AGIMI ${agimiDocumentKindLabel(parsed.documentKind)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    invoiceNumber: parsed.invoiceNumber,
    customerName: parsed.customerName,
    location: parsed.address || parsed.city || parsed.region || "—",
    locationId: parsed.locationId,
    region: parsed.region,
    city: parsed.city,
    lat: parsed.lat,
    lng: parsed.lng,
    price: parsed.price,
    orderDate: parsed.orderDate,
    notes,
    salesAgentName: parsed.salesAgent ?? null,
    items: parsed.items,
  };
}

export function parsedInvoiceToFormState(parsed: ParsedAgimiInvoice) {
  return {
    invoiceNumber: parsed.invoiceNumber,
    customerName: parsed.customerName,
    customerPhone: parsed.customerPhone ?? "",
    salesAgent: parsed.salesAgent ?? "",
    region: parsed.region,
    location: parsed.address || parsed.city || "",
    locationId: parsed.locationId ?? "",
    city: parsed.city,
    lat: parsed.lat,
    lng: parsed.lng,
    price: parsed.price ? String(parsed.price) : "",
    orderDate: parsed.orderDate,
    requestedDeliveryDate: "",
    deliveryTimePreference: "flexible" as const,
    items:
      parsed.items.length > 0
        ? parsed.items.map((item) => ({
            unit: normalizeOrderUnit(item.unit),
            productEan: item.productEan ?? "",
            productName: item.productName ?? "",
            tileWidthCm: item.tileWidthCm ?? undefined,
            tileHeightCm: item.tileHeightCm ?? undefined,
            quantityM2: item.quantityM2 ?? 0,
            weightKg: item.weightKg ?? 0,
            lengthM: item.lengthM ?? 0,
            manualPieces: item.manualPieces ?? undefined,
          }))
        : [{ unit: "m2" as const, productName: "", tileWidthCm: 60, tileHeightCm: 120, quantityM2: 0 }],
  };
}
