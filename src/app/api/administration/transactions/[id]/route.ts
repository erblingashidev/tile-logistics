import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationWrite } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  deleteRegisterTransaction,
  patchRegisterTransaction,
} from "@/lib/services/administration-register";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isFinite(transactionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      await patchRegisterTransaction(
        auth.organizationId,
        auth.session,
        transactionId,
        {
          kind: body.kind ? (String(body.kind) as never) : undefined,
          paymentMethod:
            body.paymentMethod !== undefined
              ? body.paymentMethod
                ? (String(body.paymentMethod) as never)
                : null
              : undefined,
          amountCents:
            body.amountCents != null ? Number(body.amountCents) : undefined,
          counterpartyName:
            body.counterpartyName !== undefined
              ? body.counterpartyName
                ? String(body.counterpartyName)
                : null
              : undefined,
          purpose:
            body.purpose !== undefined
              ? body.purpose
                ? String(body.purpose)
                : null
              : undefined,
          expenseCategory:
            body.expenseCategory !== undefined
              ? body.expenseCategory
                ? String(body.expenseCategory)
                : null
              : undefined,
          invoiceReference:
            body.invoiceReference !== undefined
              ? body.invoiceReference
                ? String(body.invoiceReference)
                : null
              : undefined,
          receiptReference:
            body.receiptReference !== undefined
              ? body.receiptReference
                ? String(body.receiptReference)
                : null
              : undefined,
          notes:
            body.notes !== undefined
              ? body.notes
                ? String(body.notes)
                : null
              : undefined,
        }
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      const status = message === "Forbidden" ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;
  if (
    auth.session.role !== "admin" &&
    !sessionHasPermission(auth.session, PERMISSIONS.administrationApprove)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isFinite(transactionId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      await deleteRegisterTransaction(
        auth.organizationId,
        auth.session,
        transactionId
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      const status = message === "Forbidden" ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  });
}
