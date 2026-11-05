import { NextRequest, NextResponse } from "next/server";
import {
  requireAdministrationRead,
  requireAdministrationWrite,
} from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  createRegisterTransaction,
  listRegisterTransactions,
} from "@/lib/services/administration-register";
import {
  isAdminPaymentMethod,
  isAdminTransactionKind,
} from "@/lib/administration/constants";
import { assertCashRegisterEnabled } from "@/lib/services/administration-settings";
import { guardCashRegisterEnabled } from "@/lib/services/administration-api-guards";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const registerGuard = await guardCashRegisterEnabled(auth.organizationId);
    if (registerGuard) return registerGuard;
    const pm = sp.get("paymentMethod");
    const kind = sp.get("kind");
    const transactions = await listRegisterTransactions(auth.organizationId, {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      paymentMethod:
        pm && isAdminPaymentMethod(pm) ? pm : undefined,
      kind: kind && isAdminTransactionKind(kind) ? kind : undefined,
      registerSessionId: sp.get("registerSessionId")
        ? Number(sp.get("registerSessionId"))
        : undefined,
      search: sp.get("search")?.trim() || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ transactions });
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as Record<string, unknown>;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      const kind = String(body.kind ?? "");
      const paymentMethod = body.paymentMethod
        ? String(body.paymentMethod)
        : null;
      if (!isAdminTransactionKind(kind)) {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      if (paymentMethod && !isAdminPaymentMethod(paymentMethod)) {
        return NextResponse.json(
          { error: "Invalid payment method" },
          { status: 400 }
        );
      }
      await assertCashRegisterEnabled(auth.organizationId);
      const tx = await createRegisterTransaction(
        auth.organizationId,
        auth.session,
        {
          kind,
          paymentMethod,
          amountCents: Number(body.amountCents),
          counterpartyName: body.counterpartyName
            ? String(body.counterpartyName)
            : null,
          purpose: body.purpose ? String(body.purpose) : null,
          expenseCategory: body.expenseCategory
            ? String(body.expenseCategory)
            : null,
          orderId: body.orderId ? Number(body.orderId) : null,
          invoiceReference: body.invoiceReference
            ? String(body.invoiceReference)
            : null,
          receiptReference: body.receiptReference
            ? String(body.receiptReference)
            : null,
          notes: body.notes ? String(body.notes) : null,
          recordedAt: body.recordedAt ? String(body.recordedAt) : undefined,
          idempotencyKey: body.idempotencyKey
            ? String(body.idempotencyKey)
            : null,
          salesEmployeeId: body.salesEmployeeId
            ? Number(body.salesEmployeeId)
            : null,
          salesAgentName: body.salesAgentName
            ? String(body.salesAgentName)
            : null,
        }
      );
      return NextResponse.json({ transaction: tx });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
