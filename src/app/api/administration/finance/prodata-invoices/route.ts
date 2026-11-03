import { NextRequest, NextResponse } from "next/server";
import {
  requireAdministrationRead,
  requireAdministrationWrite,
} from "@/lib/auth/administration-api";
import { listProDataFinanceInvoices } from "@/lib/services/finance-prodata-import";
import { isInvoiceSettlementStatus } from "@/lib/administration/invoice-settlement";
import {
  isAdminPaymentMethod,
  type AdminPaymentMethod,
} from "@/lib/administration/constants";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { updateProDataInvoiceSettlement } from "@/lib/services/finance-prodata-import";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const invoices = await listProDataFinanceInvoices(auth.organizationId);
    return NextResponse.json({ invoices });
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const invoiceNumber = String(body.invoiceNumber ?? "").trim();
  const settlementStatus = String(body.settlementStatus ?? "");
  const paidAmountCents =
    body.paidAmountCents != null ? Number(body.paidAmountCents) : null;
  const paymentMethod =
    body.paymentMethod != null ? String(body.paymentMethod) : undefined;

  if (!invoiceNumber) {
    return NextResponse.json({ error: "Invoice number is required." }, { status: 400 });
  }
  if (!isInvoiceSettlementStatus(settlementStatus)) {
    return NextResponse.json({ error: "Invalid settlement status." }, { status: 400 });
  }
  if (
    paymentMethod !== undefined &&
    paymentMethod !== "" &&
    !isAdminPaymentMethod(paymentMethod)
  ) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }

  try {
    return runWithTenantOrganizationAsync(auth.organizationId, async () => {
      await updateProDataInvoiceSettlement(auth.organizationId, invoiceNumber, {
        invoiceNumber,
        settlementStatus,
        paidAmountCents:
          paidAmountCents != null && Number.isFinite(paidAmountCents)
            ? Math.round(paidAmountCents)
            : null,
        paymentMethod:
          paymentMethod === undefined
            ? undefined
            : paymentMethod
              ? (paymentMethod as AdminPaymentMethod)
              : null,
      });
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
