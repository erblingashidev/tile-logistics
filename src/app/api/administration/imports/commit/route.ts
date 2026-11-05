import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationWrite } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  commitProDataFinanceImport,
  type ProDataInvoiceSettlementOverride,
} from "@/lib/services/finance-prodata-import";
import { isInvoiceSettlementStatus } from "@/lib/administration/invoice-settlement";
import { isAdminPaymentMethod } from "@/lib/administration/constants";
import { getAdministrationSettings } from "@/lib/services/administration-settings";
import { isProDataTransactionBookHeaders } from "@/lib/administration/prodata-transaction-book";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

function readHeaderColumns(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  const headerRow = rows[0] ?? [];
  return headerRow.map((cell, i) => {
    const label = String(cell ?? "").trim();
    return label || `Column ${i + 1}`;
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file." }, { status: 400 });
  }
  const name = file.name || "upload.xlsx";
  const lower = name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    return NextResponse.json(
      { error: "Pro-Data import uses .xlsx or .xls exports." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 12 MB)." },
      { status: 400 }
    );
  }

  const syncRegister = form.get("syncRegister") !== "false";
  let settlementOverrides: ProDataInvoiceSettlementOverride[] = [];
  const settlementsRaw = form.get("settlements");
  if (typeof settlementsRaw === "string" && settlementsRaw.trim()) {
    try {
      const parsed = JSON.parse(settlementsRaw) as unknown;
      if (Array.isArray(parsed)) {
        settlementOverrides = parsed
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const invoiceNumber = String(
              (row as { invoiceNumber?: string }).invoiceNumber ?? ""
            ).trim();
            const settlementStatus = String(
              (row as { settlementStatus?: string }).settlementStatus ?? ""
            );
            if (!invoiceNumber || !isInvoiceSettlementStatus(settlementStatus)) {
              return null;
            }
            const paidRaw = (row as { paidAmountCents?: number }).paidAmountCents;
            const pm = (row as { paymentMethod?: string | null }).paymentMethod;
            return {
              invoiceNumber,
              settlementStatus,
              paidAmountCents:
                paidRaw != null && Number.isFinite(Number(paidRaw))
                  ? Math.round(Number(paidRaw))
                  : null,
              paymentMethod:
                pm === undefined
                  ? undefined
                  : pm && isAdminPaymentMethod(pm)
                    ? pm
                    : null,
            } satisfies ProDataInvoiceSettlementOverride;
          })
          .filter(Boolean) as ProDataInvoiceSettlementOverride[];
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid settlements payload." },
        { status: 400 }
      );
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const columns = readHeaderColumns(buffer);
    if (!isProDataTransactionBookHeaders(columns)) {
      return NextResponse.json(
        {
          error:
            "This file is not a Pro-Data transaction book (Libri i transaksioneve). Expected columns: Transaksioni, Bleres, Vlera_shit.",
        },
        { status: 400 }
      );
    }

    return runWithTenantOrganizationAsync(auth.organizationId, async () => {
      const adminSettings = await getAdministrationSettings(auth.organizationId);
      const { analysis, result, importConflicts } =
        await commitProDataFinanceImport(
        auth.organizationId,
        auth.session,
        buffer,
        name,
        {
          syncRegisterPayments:
            syncRegister && adminSettings.cashRegisterEnabled,
          settlementOverrides,
        }
      );
      return NextResponse.json({
        ok: true,
        analysis: {
          dateFrom: analysis.dateFrom,
          dateTo: analysis.dateTo,
          byCategory: analysis.byCategory,
          byAgent: analysis.byAgent.slice(0, 12),
          paymentsDetected: analysis.paymentsDetected,
          openSalesCount: analysis.openSalesCount,
        },
        result,
        importConflicts,
        message: `Imported ${result.invoicesUpserted} invoice(s) from Pro-Data. Register: ${result.registerPaymentsCreated} payment(s), ${result.registerCreditsCreated} credit note(s).`,
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
