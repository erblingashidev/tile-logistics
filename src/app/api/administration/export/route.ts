import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { listRegisterTransactions } from "@/lib/services/administration-register";
import { expenseCategoryLabel } from "@/lib/administration/constants";

export const runtime = "nodejs";

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to are required" },
      { status: 400 }
    );
  }

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const transactions = await listRegisterTransactions(auth.organizationId, {
      from,
      to,
      limit: 2000,
    });

    const header = [
      "id",
      "recorded_at",
      "kind",
      "payment_method",
      "amount_eur",
      "customer",
      "invoice",
      "purpose",
      "expense_category",
      "locked",
    ].join(",");

    const rows = transactions.map((t) =>
      [
        String(t.id),
        t.recordedAt,
        t.kind,
        t.paymentMethod ?? "",
        (t.amountCents / 100).toFixed(2),
        t.counterpartyName ?? "",
        t.invoiceReference ?? "",
        t.purpose ?? "",
        expenseCategoryLabel(t.expenseCategory),
        t.locked ? "yes" : "no",
      ]
        .map((c) => csvEscape(c))
        .join(",")
    );

    const csv = [header, ...rows].join("\n");
    const filename = `register-ledger-${from.slice(0, 10)}-${to.slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
