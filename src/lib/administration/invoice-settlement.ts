import type { AdminPaymentMethod } from "@/lib/administration/constants";
import { mapProDataPaymentMethod } from "@/lib/administration/prodata-transaction-book";

/** How much of the invoice is settled — separate from cash/card register method. */
export const INVOICE_SETTLEMENT_STATUSES = [
  { id: "unknown", label: "Not set — choose below" },
  { id: "unpaid", label: "Unpaid / on account (full debt)" },
  { id: "on_terms", label: "On payment terms (due later)" },
  { id: "paid_partial", label: "Paid partially" },
  { id: "paid_full", label: "Paid entirely" },
  { id: "prepaid_partial", label: "Prepaid partially (advance)" },
  { id: "prepaid_full", label: "Prepaid entirely" },
  { id: "written_off", label: "Written off / no collection" },
] as const;

export type InvoiceSettlementStatus =
  (typeof INVOICE_SETTLEMENT_STATUSES)[number]["id"];

export function isInvoiceSettlementStatus(
  value: string
): value is InvoiceSettlementStatus {
  return INVOICE_SETTLEMENT_STATUSES.some((s) => s.id === value);
}

export function settlementStatusLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return (
    INVOICE_SETTLEMENT_STATUSES.find((s) => s.id === id)?.label ??
    id.replace(/_/g, " ")
  );
}

export function settlementStatusRequiresAmount(
  status: InvoiceSettlementStatus
): boolean {
  return status === "paid_partial" || status === "prepaid_partial";
}

/** Both settlement status and register payment method are set (queue can drop the row). */
export function isInvoiceSettlementAssignmentComplete(input: {
  settlementStatus: InvoiceSettlementStatus | string | null;
  paidAmountCents: number | null;
  paymentMethod: string | null;
}): boolean {
  const status = input.settlementStatus;
  if (!status || status === "unknown") return false;
  if (!input.paymentMethod?.trim()) return false;
  if (
    settlementStatusRequiresAmount(status as InvoiceSettlementStatus) &&
    (input.paidAmountCents == null || input.paidAmountCents <= 0)
  ) {
    return false;
  }
  return isInvoiceSettlementStatus(String(status));
}

/** True when invoice should not appear in open-debt lists (fully settled). */
export function settlementIsFullySettled(
  status: InvoiceSettlementStatus | null | undefined
): boolean {
  return (
    status === "paid_full" ||
    status === "prepaid_full" ||
    status === "written_off"
  );
}

export function settlementIsOpenDebt(
  status: InvoiceSettlementStatus | null | undefined
): boolean {
  if (!status || status === "unknown") return true;
  return (
    status === "unpaid" ||
    status === "on_terms" ||
    status === "paid_partial" ||
    status === "prepaid_partial"
  );
}

export function settlementPaidCentsFromStatus(
  invoicedCents: number,
  status: InvoiceSettlementStatus,
  explicitPaidCents: number | null | undefined
): number {
  const absInv = Math.abs(invoicedCents);
  switch (status) {
    case "paid_full":
    case "prepaid_full":
      return absInv;
    case "paid_partial":
    case "prepaid_partial": {
      const paid = explicitPaidCents ?? 0;
      return Math.min(absInv, Math.max(0, paid));
    }
    case "written_off":
      return absInv;
    case "unpaid":
    case "on_terms":
    case "unknown":
    default:
      return 0;
  }
}

function normalizeSettlementText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Parse Pro-Data “MENYRA E PAGESES” and similar free text. */
export function mapProDataSettlementStatus(raw: string): {
  settlementStatus: InvoiceSettlementStatus;
  paidAmountCents: number | null;
} {
  const s = normalizeSettlementText(raw);
  if (!s) {
    return { settlementStatus: "unknown", paidAmountCents: null };
  }

  if (/shkruar|written\s*off|fal/i.test(s)) {
    return { settlementStatus: "written_off", paidAmountCents: null };
  }
  if (/parapag|pre\s*paid|avanc/i.test(s)) {
    if (/pjessh|partial|pjeser/i.test(s)) {
      return { settlementStatus: "prepaid_partial", paidAmountCents: null };
    }
    if (/plote|full|ter/i.test(s)) {
      return { settlementStatus: "prepaid_full", paidAmountCents: null };
    }
    return { settlementStatus: "prepaid_partial", paidAmountCents: null };
  }
  if (/paguar|paid/i.test(s)) {
    if (/pjessh|partial|pjeser/i.test(s)) {
      return { settlementStatus: "paid_partial", paidAmountCents: null };
    }
    return { settlementStatus: "paid_full", paidAmountCents: null };
  }
  if (/pa\s*pag|unpaid|borxh|me\s*borxh|kredi\s*klient/i.test(s)) {
    return { settlementStatus: "unpaid", paidAmountCents: null };
  }
  if (/afat|terms|koh/i.test(s)) {
    return { settlementStatus: "on_terms", paidAmountCents: null };
  }

  // Only a register method named (e.g. "Arke") → treat as paid in full via that method
  const method = mapProDataPaymentMethod(raw);
  if (method && method !== "unpaid" && method !== "other") {
    return { settlementStatus: "paid_full", paidAmountCents: null };
  }
  if (method === "unpaid") {
    return { settlementStatus: "unpaid", paidAmountCents: null };
  }

  return { settlementStatus: "unknown", paidAmountCents: null };
}

export type InvoiceSettlementInput = {
  settlementStatus: InvoiceSettlementStatus;
  paidAmountCents?: number | null;
  paymentMethod?: AdminPaymentMethod | null;
};

export function parsePaidEurosInput(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
