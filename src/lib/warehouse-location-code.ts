/** Outdoor warehouse row codes, e.g. D3-K1M = Depo 3, Kolona 1 Majtas. */

const OUTDOOR_ROW_RE = /^D(\d+)-K(\d+)([MD])$/i;

export function parseOutdoorLocationCode(code: string): {
  depo: number;
  column: number;
  side: "M" | "D";
} | null {
  const m = code.trim().toUpperCase().match(OUTDOOR_ROW_RE);
  if (!m) return null;
  return {
    depo: Number(m[1]),
    column: Number(m[2]),
    side: m[3] as "M" | "D",
  };
}

export function formatOutdoorLocationLabel(code: string): string {
  const parsed = parseOutdoorLocationCode(code);
  if (!parsed) return code;
  const side =
    parsed.side === "M" ? "Majtas (left)" : "Djathtas (right)";
  return `Depo ${parsed.depo}, Kolona ${parsed.column} ${side}`;
}

export function formatLocationOption(code: string, zone?: string | null): string {
  const parsed = parseOutdoorLocationCode(code);
  if (!parsed) {
    return zone ? `${code} · ${zone}` : code;
  }
  const side = parsed.side === "M" ? "Majtas" : "Djathtas";
  return `${code} · Depo ${parsed.depo}, K${parsed.column} ${side}`;
}
