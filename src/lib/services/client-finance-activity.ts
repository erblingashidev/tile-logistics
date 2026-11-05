import { and, desc, eq, inArray } from "drizzle-orm";
import { getControlPlaneDb } from "@/lib/db";
import {
  adminRegisterAuditLog,
  admins,
  employees,
  financeProdataImportBatches,
  financeProdataInvoices,
} from "@/lib/db/schema";
import { settlementStatusLabel } from "@/lib/administration/invoice-settlement";
import type { ClientFinanceProfile } from "@/lib/services/administration-clients";

export type ClientFinanceActivityEntry = {
  id: string;
  occurredAt: string;
  kind:
    | "prodata_sale"
    | "prodata_import"
    | "prodata_update"
    | "settlement_change"
    | "register_payment"
    | "register_refund"
    | "register_other"
    | "order";
  invoiceNumber: string | null;
  title: string;
  detail: string;
  amountCents: number | null;
  actorLabel: string | null;
};

function normalizeInv(ref: string | null | undefined): string {
  return (ref ?? "").trim().toLowerCase();
}

function methodLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return id.replace(/_/g, " ");
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function parsePayload(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function buildClientFinanceActivityLog(
  organizationId: number,
  profile: ClientFinanceProfile
): Promise<ClientFinanceActivityEntry[]> {
  const invoiceNumbers = [
    ...new Set(
      profile.invoices.map((i) => i.invoiceNumber.trim()).filter(Boolean)
    ),
  ];
  const invoiceNorms = new Set(invoiceNumbers.map(normalizeInv));
  const entries: ClientFinanceActivityEntry[] = [];

  for (const inv of profile.invoices) {
    if (!inv.invoiceNumber.trim()) continue;
    if (inv.orderId != null) {
      entries.push({
        id: `order-${inv.orderId}`,
        occurredAt: inv.orderDate
          ? `${inv.orderDate.slice(0, 10)}T12:00:00.000Z`
          : "",
        kind: "order",
        invoiceNumber: inv.invoiceNumber,
        title: `Logistics order · ${inv.invoiceNumber}`,
        detail: [inv.orderStatus, inv.location].filter(Boolean).join(" · ") || "—",
        amountCents: inv.invoicedCents,
        actorLabel: inv.salesAgentName,
      });
    }
  }

  for (const line of profile.registerLines) {
    const kind =
      line.kind === "payment"
        ? "register_payment"
        : line.kind === "return_refund"
          ? "register_refund"
          : "register_other";
    entries.push({
      id: `reg-${line.id}`,
      occurredAt: line.recordedAt,
      kind,
      invoiceNumber: line.invoiceReference,
      title:
        line.kind === "payment"
          ? `Register payment${line.invoiceReference ? ` · ${line.invoiceReference}` : ""}`
          : line.kind.replace(/_/g, " "),
      detail: [methodLabel(line.paymentMethod), line.purpose]
        .filter(Boolean)
        .join(" · "),
      amountCents: line.amountCents,
      actorLabel: line.salesAgentName,
    });
  }

  if (invoiceNumbers.length > 0) {
    const db = await getControlPlaneDb();
    const proRows = await db
      .select({
        invoiceNumber: financeProdataInvoices.invoiceNumber,
        transactionDate: financeProdataInvoices.transactionDate,
        netValueCents: financeProdataInvoices.netValueCents,
        paymentMethodRaw: financeProdataInvoices.paymentMethodRaw,
        paymentMethod: financeProdataInvoices.paymentMethod,
        settlementStatus: financeProdataInvoices.settlementStatus,
        paidAmountCents: financeProdataInvoices.paidAmountCents,
        updatedAt: financeProdataInvoices.updatedAt,
        fileName: financeProdataImportBatches.fileName,
        batchCreatedAt: financeProdataImportBatches.createdAt,
      })
      .from(financeProdataInvoices)
      .innerJoin(
        financeProdataImportBatches,
        eq(financeProdataInvoices.batchId, financeProdataImportBatches.id)
      )
      .where(
        and(
          eq(financeProdataInvoices.organizationId, organizationId),
          inArray(financeProdataInvoices.invoiceNumber, invoiceNumbers)
        )
      );

    for (const row of proRows) {
      const saleAt = `${row.transactionDate.slice(0, 10)}T12:00:00.000Z`;
      entries.push({
        id: `pro-sale-${row.invoiceNumber}`,
        occurredAt: saleAt,
        kind: "prodata_sale",
        invoiceNumber: row.invoiceNumber,
        title: `Pro-Data sale · ${row.invoiceNumber}`,
        detail: row.paymentMethodRaw?.trim()
          ? `Menyra: ${row.paymentMethodRaw}`
          : "Imported from transaction book",
        amountCents: row.netValueCents,
        actorLabel: null,
      });
      entries.push({
        id: `pro-batch-${row.invoiceNumber}-${row.batchCreatedAt}`,
        occurredAt: row.batchCreatedAt,
        kind: "prodata_import",
        invoiceNumber: row.invoiceNumber,
        title: `Excel import · ${row.invoiceNumber}`,
        detail: row.fileName,
        amountCents: row.netValueCents,
        actorLabel: null,
      });
      const statusDetail = [
        settlementStatusLabel(row.settlementStatus),
        row.paymentMethod ? methodLabel(row.paymentMethod) : null,
        row.paidAmountCents != null && row.paidAmountCents > 0
          ? `Recorded paid ${formatMoney(row.paidAmountCents)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      if (row.updatedAt && row.updatedAt !== row.batchCreatedAt) {
        entries.push({
          id: `pro-upd-${row.invoiceNumber}-${row.updatedAt}`,
          occurredAt: row.updatedAt,
          kind: "prodata_update",
          invoiceNumber: row.invoiceNumber,
          title: `Pro-Data record updated · ${row.invoiceNumber}`,
          detail: statusDetail || "Settlement / payment data synced",
          amountCents: row.netValueCents,
          actorLabel: null,
        });
      } else if (statusDetail && row.settlementStatus !== "unknown") {
        entries.push({
          id: `pro-set-${row.invoiceNumber}-${row.updatedAt}`,
          occurredAt: row.updatedAt || row.batchCreatedAt,
          kind: "prodata_update",
          invoiceNumber: row.invoiceNumber,
          title: `Payment status · ${row.invoiceNumber}`,
          detail: statusDetail,
          amountCents: row.paidAmountCents,
          actorLabel: null,
        });
      }
    }

    const auditRows = await db
      .select({
        id: adminRegisterAuditLog.id,
        action: adminRegisterAuditLog.action,
        entityType: adminRegisterAuditLog.entityType,
        payloadJson: adminRegisterAuditLog.payloadJson,
        createdAt: adminRegisterAuditLog.createdAt,
        employeeName: employees.name,
        adminUsername: admins.username,
      })
      .from(adminRegisterAuditLog)
      .leftJoin(
        employees,
        eq(adminRegisterAuditLog.actorEmployeeId, employees.id)
      )
      .leftJoin(admins, eq(adminRegisterAuditLog.actorAdminId, admins.id))
      .where(eq(adminRegisterAuditLog.organizationId, organizationId))
      .orderBy(desc(adminRegisterAuditLog.createdAt))
      .limit(400);

    for (const row of auditRows) {
      const payload = parsePayload(row.payloadJson);
      const invRaw =
        typeof payload?.invoiceNumber === "string"
          ? payload.invoiceNumber
          : typeof payload?.invoiceReference === "string"
            ? payload.invoiceReference
            : null;
      if (!invRaw || !invoiceNorms.has(normalizeInv(invRaw))) continue;

      if (
        row.entityType === "finance_invoice" ||
        row.action === "settlement_updated" ||
        row.action === "finance_invoice_import"
      ) {
        const before = payload?.before as Record<string, unknown> | undefined;
        const after = payload?.after as Record<string, unknown> | undefined;
        const changes: string[] = [];
        if (before && after) {
          if (before.settlementStatus !== after.settlementStatus) {
            changes.push(
              `Status: ${settlementStatusLabel(String(before.settlementStatus))} → ${settlementStatusLabel(String(after.settlementStatus))}`
            );
          }
          if (before.paymentMethod !== after.paymentMethod) {
            changes.push(
              `Method: ${methodLabel(String(before.paymentMethod ?? ""))} → ${methodLabel(String(after.paymentMethod ?? ""))}`
            );
          }
          if (before.paidAmountCents !== after.paidAmountCents) {
            changes.push(
              `Paid amount: ${formatMoney(Number(before.paidAmountCents ?? 0))} → ${formatMoney(Number(after.paidAmountCents ?? 0))}`
            );
          }
          if (before.paymentMethodRaw !== after.paymentMethodRaw) {
            changes.push(
              `Menyra: ${String(before.paymentMethodRaw ?? "—")} → ${String(after.paymentMethodRaw ?? "—")}`
            );
          }
        } else if (payload?.fileName) {
          changes.push(`File: ${String(payload.fileName)}`);
        }

        const actor =
          row.employeeName?.trim() ||
          row.adminUsername?.trim() ||
          null;

        entries.push({
          id: `audit-${row.id}`,
          occurredAt: row.createdAt,
          kind: "settlement_change",
          invoiceNumber: invRaw,
          title:
            row.action === "finance_invoice_import"
              ? `Import sync · ${invRaw}`
              : `Assignment saved · ${invRaw}`,
          detail: changes.length ? changes.join(" · ") : row.action,
          amountCents:
            typeof after?.paidAmountCents === "number"
              ? after.paidAmountCents
              : null,
          actorLabel: actor,
        });
      }
    }
  }

  return entries
    .filter((e) => e.occurredAt)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
