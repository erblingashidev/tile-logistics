/** Kosovo mobile prefixes (without leading 0). */
const MOBILE_OPERATOR_SECOND_DIGIT = "[3-9]";

function digitsOnly(text: string): string {
  return text.replace(/\D/g, "");
}

/** Business / fiscal identifiers that must not be treated as phone numbers. */
export function isBusinessOrFiscalId(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^(numri unik|nui\s*:|no fiskal|nr\.?\s*tvsh|fiskal)/i.test(trimmed)) {
    return true;
  }
  const digits = digitsOnly(trimmed);
  if (digits.length < 7 || digits.length > 13) return false;
  if (isKosovoPhone(trimmed)) return false;
  // Plain numeric lines in buyer blocks are usually NUI / fiscal, not mobile.
  if (/^[\d\s./-]+$/.test(trimmed)) return true;
  return false;
}

/** True for Kosovo mobiles: 04X…, +383 4X…, 3834X… */
export function isKosovoPhone(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/[\d+]/.test(trimmed)) return false;
  if (/^(numri unik|nui\s*:|no fiskal)/i.test(trimmed)) return false;

  const digits = digitsOnly(trimmed);

  // International +383 / 383
  if (/^\+?383/.test(trimmed) || digits.startsWith("383")) {
    const local = digits.startsWith("383") ? digits.slice(3) : digits.slice(3);
    const normalized = local.startsWith("0") ? local.slice(1) : local;
    return new RegExp(`^4${MOBILE_OPERATOR_SECOND_DIGIT}\\d{6,7}$`).test(
      normalized
    );
  }

  // Local 04X XXX XXX (9 digits)
  if (digits.startsWith("0")) {
    return new RegExp(`^04${MOBILE_OPERATOR_SECOND_DIGIT}\\d{6,7}$`).test(digits);
  }

  // Shorthand without leading 0: 45 669 985
  if (digits.length >= 8 && digits.length <= 9) {
    return new RegExp(`^4${MOBILE_OPERATOR_SECOND_DIGIT}\\d{6,7}$`).test(digits);
  }

  return false;
}

/** Normalize to a compact display form, or null if not a valid Kosovo phone. */
export function normalizeKosovoPhone(text: string): string | null {
  const trimmed = text.trim();
  if (!isKosovoPhone(trimmed)) return null;

  const digits = digitsOnly(trimmed);
  let local: string;

  if (digits.startsWith("383")) {
    local = digits.slice(3);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (local.length === 8) {
    return `0${local.slice(0, 2)}/${local.slice(2, 5)}${local.slice(5)}`;
  }
  if (local.length === 9 && local.startsWith("4")) {
    return `0${local.slice(0, 2)}/${local.slice(2, 5)}${local.slice(5)}`;
  }

  return trimmed.replace(/\s+/g, " ").trim();
}

/** Extract phone from invoice notes or labeled Telefoni field. */
export function extractKosovoPhoneFromText(text: string): string | null {
  const labeled =
    text.match(/Telefoni\s*:?\s*([^\n·]+)/i)?.[1]?.trim() ??
    text.match(/Phone:\s*([^\n·]+)/i)?.[1]?.trim();
  if (labeled) {
    const normalized = normalizeKosovoPhone(labeled);
    if (normalized) return normalized;
  }

  for (const line of text.split(/[\n·]/)) {
    const candidate = line.trim();
    if (!candidate) continue;
    const normalized = normalizeKosovoPhone(candidate);
    if (normalized) return normalized;
  }

  return null;
}
