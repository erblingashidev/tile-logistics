import { resolveLocation, type LocationEntry } from "@/lib/locations";
import type { OrderItemPayload, OrderPayload } from "@/lib/services/orders";

export interface ParsedAgimiInvoice {
  invoiceNumber: string;
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
    .replace(/[♦•]/g, " ")
    .replace(/\u00a0/g, " ");
}

function parseInvoiceDate(text: string): string | null {
  const dates = [...text.matchAll(/(\d{2})\.(\d{2})\.(\d{4})/g)].map(
    (m) => `${m[3]}-${m[2]}-${m[1]}`
  );
  if (dates.length === 0) return null;
  return dates.sort().at(-1) ?? dates[0];
}

function parseCustomerName(text: string): string | null {
  const match = text.match(/Bler[ëe]si:\s*([\s\S]+?)(?:\n\s*Adresa|\nAdresa)/i);
  if (!match) return null;

  const lines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^I[''']?$/i.test(line));

  const name = lines.join(" ").replace(/\s+/g, " ").trim();
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

function normalizeShvInvoiceNumber(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function parseInvoiceNumber(text: string): string | null {
  // AGIMI fiscal barcode (top-right), e.g. 26-SHV01-001-6263 — OCR often splits SHV01 across lines.
  const splitShv = text.match(
    /(\d{2})\s*-\s*SHV\s*(\d)\s*[\s\n]+(\d)\s*-\s*(\d{3})\s*-\s*(\d{4})/i
  );
  if (splitShv) {
    return `${splitShv[1]}-SHV${splitShv[2]}${splitShv[3]}-${splitShv[4]}-${splitShv[5]}`;
  }

  const compactShv = text.match(/\b(\d{2}-SHV\d{2}-\d{3}-\d{4})\b/i);
  if (compactShv) {
    return normalizeShvInvoiceNumber(compactShv[1]);
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
    /per\s*\n?\s*pagese:\s*([\d.,]+)/i,
    /Mb\s*etja:\s*([\d.,]+)/i,
    /Vlera\s*\n?\s*per\s*\n?\s*pagese:\s*([\d.,]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseLocaleNumber(match[1]);
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

function isProductNoiseLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^SL$/i.test(t)) return true;
  if (/^\d{1,2}$/.test(t)) return true;
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(t)) return true;
  if (/^Jti,?$/i.test(t)) return true;
  if (/^Normat$|^Tatimore$|^Baza$|^TVSH$/i.test(t)) return true;
  if (/^\d{8,12}$/.test(t)) return true;
  return false;
}

function joinProductLines(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !isProductNoiseLine(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProductName(
  text: string,
  productEan: string | null,
  sizeLabel: string | null
): string {
  const emertimi = text.match(
    /Emertimi\s*[\s\S]{0,60}?\n([\s\S]+?)(?=\n\s*Normat\s+Tatimore|\nNormat\s+Tatimore)/i
  );
  if (emertimi) {
    const name = joinProductLines(emertimi[1].split("\n"));
    if (name.length >= 3) return name;
  }

  const anchor = productEan?.trim();
  if (anchor) {
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = text.match(
      new RegExp(
        `${escaped}[\\s\\S]{0,240}?(?=Normat\\s+Tatimore|TVSH\\s*\\n?\\s*e\\s+llogaritur)`,
        "i"
      )
    );
    if (block) {
      const afterAnchor = block[0].slice(anchor.length);
      const name = joinProductLines(afterAnchor.split("\n"));
      if (name.length >= 3) return name;
    }
  }

  return sizeLabel ? `Tile ${sizeLabel}` : "Tile";
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
  const text = normalizeInvoiceText(rawText);
  const warnings: string[] = [];

  const invoiceNumber = parseInvoiceNumber(text);
  const productEan = parseProductEan(text);
  const customerName = parseCustomerName(text);
  const address = parseAddress(text) ?? "";
  const cityRaw = parseCity(text) ?? "";
  const orderDate = parseInvoiceDate(text);
  const price = parseTotalPrice(text);
  const quantityM2 = parseQuantityM2(text);
  const tileSize = parseTileSize(text);
  const sizeLabel = tileSize
    ? `${tileSize.w}×${tileSize.h}`
    : null;

  if (!invoiceNumber) warnings.push("Could not read invoice number — enter manually.");
  if (!customerName) warnings.push("Could not read customer name — enter manually.");
  if (!orderDate) warnings.push("Could not read invoice date — using today.");
  if (price == null) warnings.push("Could not read total price — enter manually.");
  if (quantityM2 == null) warnings.push("Could not read m² quantity — enter manually.");

  const locationFields = cityRaw
    ? resolveDeliveryLocation(cityRaw, address)
    : {
        region: "",
        city: "",
        location: address || "—",
      };

  if (!cityRaw) {
    warnings.push("Could not read delivery city — select region on the form.");
  } else if (!locationFields.lat) {
    warnings.push(
      `City "${cityRaw}" mapped to ${locationFields.region} — confirm delivery location on map.`
    );
  }

  const phoneMatch = parseCustomerPhone(text);
  const fiscalMatch = text.match(/No fiskal:\s*(\d+)/i);

  const items: OrderItemPayload[] = [];
  if (quantityM2 != null && tileSize) {
    items.push({
      productType: "tile",
      productName: parseProductName(text, productEan, sizeLabel),
      tileWidthCm: tileSize.w,
      tileHeightCm: tileSize.h,
      quantityM2: quantityM2,
    });
  } else if (quantityM2 != null) {
    items.push({
      productType: "tile",
      productName: parseProductName(text, productEan, sizeLabel),
      tileWidthCm: 60,
      tileHeightCm: 120,
      quantityM2: quantityM2,
    });
    warnings.push("Tile size not found — defaulting to 60×120 cm.");
  }

  return {
    invoiceNumber: invoiceNumber ?? "",
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
    items: items.length > 0 ? items : [{ productType: "tile", quantityM2: 0 }],
    warnings,
  };
}

export function parsedInvoiceToOrderPayload(
  parsed: ParsedAgimiInvoice
): OrderPayload {
  const notes = [
    parsed.customerPhone ? `Phone: ${parsed.customerPhone}` : null,
    parsed.fiscalNumber ? `Fiscal no: ${parsed.fiscalNumber}` : null,
    "Imported from AGIMI invoice PDF",
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
    items: parsed.items,
  };
}

export function parsedInvoiceToFormState(parsed: ParsedAgimiInvoice) {
  return {
    invoiceNumber: parsed.invoiceNumber,
    customerName: parsed.customerName,
    customerPhone: parsed.customerPhone ?? "",
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
            productType: item.productType,
            productName: item.productName ?? "",
            tileWidthCm: item.tileWidthCm ?? 60,
            tileHeightCm: item.tileHeightCm ?? 120,
            quantityM2: item.quantityM2 ?? 0,
          }))
        : [{ productType: "tile" as const, productName: "", tileWidthCm: 60, tileHeightCm: 120, quantityM2: 0 }],
  };
}
