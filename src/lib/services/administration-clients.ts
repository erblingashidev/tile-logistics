import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import {
  invoiceReferencesMatch,
  invoiceRowHasSalesAgent,
} from "@/lib/administration/validation";
import { listRegisterTransactions } from "@/lib/services/administration-register";
import {
  settlementIsFullySettled,
  settlementPaidCentsFromStatus,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { buildClientCallReasons } from "@/lib/administration/call-list";
import { invoiceMatchesBusinessDay } from "@/lib/administration/prodata-invoice-conflicts";
import {
  listProDataFinanceInvoices,
  type ProDataFinanceInvoiceRow,
} from "@/lib/services/finance-prodata-import";

export function normalizeClientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeInvoiceRef(ref: string | null | undefined): string {
  return (ref ?? "").trim().toLowerCase();
}

function pickDisplayName(current: string, candidate: string): string {
  const c = candidate.trim();
  if (!c) return current;
  if (!current) return c;
  if (c.length > current.length) return c;
  return current;
}

export type ClientInvoiceRow = {
  invoiceNumber: string;
  orderId: number | null;
  orderDate: string | null;
  orderStatus: string | null;
  location: string | null;
  invoicedCents: number;
  paidCents: number;
  balanceDueCents: number;
  salesEmployeeId: number | null;
  salesAgentName: string | null;
  daysOutstanding: number;
  settlementStatus: InvoiceSettlementStatus | null;
  paymentMethodRaw: string | null;
  paymentMethod: string | null;
  settlementPaidAmountCents: number | null;
  prodataTransactionDate: string | null;
};

export type OverdueDebtItem = {
  clientKey: string;
  displayName: string;
  invoiceNumber: string;
  balanceDueCents: number;
  invoicedCents: number;
  orderDate: string;
  daysOutstanding: number;
  salesEmployeeId: number | null;
  salesAgentName: string;
  orderStatus: string | null;
  location: string | null;
  settlementStatus: InvoiceSettlementStatus | null;
  paymentMethodRaw: string | null;
  paymentMethod: string | null;
  settlementPaidAmountCents: number | null;
  prodataTransactionDate: string | null;
};

export type AgentDebtGroup = {
  salesEmployeeId: number | null;
  salesAgentName: string;
  totalDueCents: number;
  overdueDueCents: number;
  clientCount: number;
  items: OverdueDebtItem[];
};

function applyProDataSettlementToInvoice(
  invoicedCents: number,
  priorPaidCents: number,
  ext: ProDataFinanceInvoiceRow
): Pick<
  ClientInvoiceRow,
  "paidCents" | "balanceDueCents" | "settlementStatus" | "paymentMethodRaw"
> {
  const fromStatus = settlementPaidCentsFromStatus(
    invoicedCents,
    ext.settlementStatus,
    ext.paidAmountCents
  );
  let paidCents = Math.max(priorPaidCents, fromStatus);
  if (settlementIsFullySettled(ext.settlementStatus)) {
    paidCents = Math.max(paidCents, Math.abs(invoicedCents));
  }
  const balanceDueCents = Math.max(0, invoicedCents - paidCents);
  return {
    paidCents,
    balanceDueCents,
    settlementStatus: ext.settlementStatus,
    paymentMethodRaw: ext.paymentMethodRaw,
  };
}

function daysSinceDate(isoDate: string): number {
  const start = new Date(isoDate.slice(0, 10) + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export type ClientRegisterLine = {
  id: number;
  recordedAt: string;
  kind: string;
  paymentMethod: string | null;
  amountCents: number;
  invoiceReference: string | null;
  purpose: string | null;
  counterpartyName: string | null;
  salesEmployeeId: number | null;
  salesAgentName: string | null;
};

export type ClientFinanceProfile = {
  clientKey: string;
  displayName: string;
  totalInvoicedCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  unpaidOnAccountCents: number;
  invoiceCount: number;
  paymentCount: number;
  lastActivityAt: string | null;
  callReasons: string[];
  invoices: ClientInvoiceRow[];
  registerLines: ClientRegisterLine[];
  paymentMethodTotals: Array<{
    paymentMethod: string | null;
    totalCents: number;
    count: number;
  }>;
};

type ProfileMutable = ClientFinanceProfile & {
  invoiceByNorm: Map<string, ClientInvoiceRow>;
};

function emptyProfile(clientKey: string, displayName: string): ProfileMutable {
  return {
    clientKey,
    displayName,
    totalInvoicedCents: 0,
    totalPaidCents: 0,
    balanceDueCents: 0,
    unpaidOnAccountCents: 0,
    invoiceCount: 0,
    paymentCount: 0,
    lastActivityAt: null,
    callReasons: [],
    invoices: [],
    registerLines: [],
    paymentMethodTotals: [],
    invoiceByNorm: new Map(),
  };
}

function touchActivity(profile: ProfileMutable, at: string) {
  if (!profile.lastActivityAt || at > profile.lastActivityAt) {
    profile.lastActivityAt = at;
  }
}

function finalizeProfile(profile: ProfileMutable): ClientFinanceProfile {
  profile.invoices = [...profile.invoiceByNorm.values()]
    .filter((inv) => inv.invoiceNumber.trim().length > 0)
    .sort((a, b) => (b.orderDate ?? "").localeCompare(a.orderDate ?? ""));
  profile.invoiceCount = profile.invoices.length;

  let invoiced = 0;
  let paid = 0;
  let balance = 0;
  for (const inv of profile.invoices) {
    invoiced += inv.invoicedCents;
    paid += inv.paidCents;
    balance += inv.balanceDueCents;
  }
  profile.totalInvoicedCents = invoiced;
  profile.totalPaidCents = paid;
  profile.balanceDueCents = balance;

  const methodMap = new Map<string | null, { totalCents: number; count: number }>();
  for (const line of profile.registerLines) {
    if (line.kind !== "payment" && line.kind !== "return_refund") continue;
    const key = line.paymentMethod ?? null;
    const prev = methodMap.get(key) ?? { totalCents: 0, count: 0 };
    methodMap.set(key, {
      totalCents: prev.totalCents + line.amountCents,
      count: prev.count + 1,
    });
  }
  profile.paymentMethodTotals = [...methodMap.entries()].map(
    ([paymentMethod, v]) => ({ paymentMethod, ...v })
  );
  profile.paymentCount = profile.registerLines.filter(
    (l) => l.kind === "payment"
  ).length;

  profile.callReasons = buildClientCallReasons({
    balanceDueCents: profile.balanceDueCents,
    lastActivityAt: profile.lastActivityAt,
    registerLines: profile.registerLines,
    invoices: profile.invoices,
  });

  const { invoiceByNorm: _omit, ...rest } = profile;
  return rest;
}

export async function buildClientFinanceProfiles(
  organizationId: number
): Promise<ClientFinanceProfile[]> {
  const tenantDb = await getDb();
  const orderRows = await tenantDb
    .select()
    .from(orders)
    .where(eq(orders.organizationId, organizationId));

  const registerRows = await listRegisterTransactions(organizationId, {
    limit: 2000,
  });

  const profiles = new Map<string, ProfileMutable>();
  const invoiceOwner = new Map<string, string>();

  function getProfile(rawName: string): ProfileMutable {
    const displayName = (rawName ?? "").trim() || "Unknown client";
    const key = normalizeClientKey(displayName);
    let profile = profiles.get(key);
    if (!profile) {
      profile = emptyProfile(key, displayName);
      profiles.set(key, profile);
    } else {
      profile.displayName = pickDisplayName(profile.displayName, displayName);
    }
    return profile;
  }

  const prodataInvoices = await listProDataFinanceInvoices(organizationId);

  for (const ext of prodataInvoices) {
    if (!ext.invoiceNumber?.trim()) continue;
    if (ext.documentCategory === "delivery_note") continue;

    const profile = getProfile(ext.buyerName);
    const normInv = normalizeInvoiceRef(ext.invoiceNumber);
    invoiceOwner.set(normInv, profile.clientKey);

    const existing = profile.invoiceByNorm.get(normInv);
    const agentName = ext.salesAgentName?.trim() || null;
    const orderDate = ext.transactionDate;
    const isCredit =
      ext.documentCategory === "credit_note" || ext.netValueCents < 0;
    const invoicedCents = isCredit ? 0 : ext.netValueCents;
    const creditPaidCents = isCredit ? Math.abs(ext.netValueCents) : 0;
    const settlementApply = isCredit
      ? null
      : applyProDataSettlementToInvoice(invoicedCents, creditPaidCents, ext);

    if (existing) {
      existing.invoicedCents = invoicedCents;
      if (creditPaidCents > 0) {
        existing.paidCents = Math.max(existing.paidCents, creditPaidCents);
      }
      if (settlementApply) {
        existing.paidCents = Math.max(
          existing.paidCents,
          settlementApply.paidCents
        );
        existing.balanceDueCents = settlementApply.balanceDueCents;
        existing.settlementStatus = settlementApply.settlementStatus;
        existing.paymentMethodRaw = settlementApply.paymentMethodRaw;
        existing.paymentMethod = ext.paymentMethod;
        existing.settlementPaidAmountCents = ext.paidAmountCents;
        existing.prodataTransactionDate = orderDate;
      }
      if (agentName && !existing.salesAgentName) {
        existing.salesAgentName = agentName;
      }
      if (orderDate) {
        existing.orderDate = orderDate;
      }
      existing.daysOutstanding = daysSinceDate(existing.orderDate ?? orderDate);
      if (!settlementApply) {
        existing.balanceDueCents = Math.max(
          0,
          existing.invoicedCents - existing.paidCents
        );
      }
    } else {
      profile.invoiceByNorm.set(normInv, {
        invoiceNumber: ext.invoiceNumber.trim(),
        orderId: null,
        orderDate,
        orderStatus: null,
        location: null,
        invoicedCents,
        paidCents: settlementApply?.paidCents ?? creditPaidCents,
        balanceDueCents:
          settlementApply?.balanceDueCents ??
          Math.max(0, invoicedCents - creditPaidCents),
        salesEmployeeId: null,
        salesAgentName: agentName,
        daysOutstanding: daysSinceDate(orderDate),
        settlementStatus: settlementApply?.settlementStatus ?? null,
        paymentMethodRaw: settlementApply?.paymentMethodRaw ?? ext.paymentMethodRaw,
        paymentMethod: ext.paymentMethod,
        settlementPaidAmountCents: ext.paidAmountCents,
        prodataTransactionDate: orderDate,
      });
    }
    touchActivity(profile, orderDate);
  }

  for (const order of orderRows) {
    if (!order.invoiceNumber?.trim()) continue;
    const profile = getProfile(order.customerName);
    const normInv = normalizeInvoiceRef(order.invoiceNumber);
    invoiceOwner.set(normInv, profile.clientKey);
    const invoicedCents = Math.round(Number(order.price) * 100);
    const existing = profile.invoiceByNorm.get(normInv);
    const row: ClientInvoiceRow = {
      invoiceNumber: order.invoiceNumber,
      orderId: order.id,
      orderDate: order.orderDate,
      orderStatus: order.status,
      location: order.location,
      invoicedCents: existing?.invoicedCents ?? invoicedCents,
      paidCents: existing?.paidCents ?? 0,
      balanceDueCents:
        existing?.balanceDueCents ??
        Math.max(0, (existing?.invoicedCents ?? invoicedCents) - 0),
      salesEmployeeId: order.salesEmployeeId ?? existing?.salesEmployeeId ?? null,
      salesAgentName:
        order.salesAgentName?.trim() ||
        existing?.salesAgentName ||
        null,
      daysOutstanding: daysSinceDate(order.orderDate),
      settlementStatus: existing?.settlementStatus ?? null,
      paymentMethodRaw: existing?.paymentMethodRaw ?? null,
      paymentMethod: existing?.paymentMethod ?? null,
      settlementPaidAmountCents: existing?.settlementPaidAmountCents ?? null,
      prodataTransactionDate: existing?.prodataTransactionDate ?? null,
    };
    if (!existing) {
      row.balanceDueCents = row.invoicedCents;
    }
    profile.invoiceByNorm.set(normInv, row);
    touchActivity(profile, order.orderDate);
  }

  for (const tx of registerRows) {
    const normInv = normalizeInvoiceRef(tx.invoiceReference);
    if (!normInv) continue;

    const line: ClientRegisterLine = {
      id: tx.id,
      recordedAt: tx.recordedAt,
      kind: tx.kind,
      paymentMethod: tx.paymentMethod,
      amountCents: tx.amountCents,
      invoiceReference: tx.invoiceReference,
      purpose: tx.purpose,
      counterpartyName: tx.counterpartyName,
      salesEmployeeId: tx.salesEmployeeId ?? null,
      salesAgentName: tx.salesAgentName ?? null,
    };

    const name = tx.counterpartyName?.trim();
    let clientKey = invoiceOwner.get(normInv);
    if (!clientKey && name) {
      clientKey = normalizeClientKey(name);
    }
    if (!clientKey) continue;

    const profile = profiles.get(clientKey) ?? getProfile(name ?? clientKey);
    profile.registerLines.push(line);
    touchActivity(profile, tx.recordedAt);

    if (tx.paymentMethod === "unpaid" && tx.kind === "payment") {
      profile.unpaidOnAccountCents += Math.abs(tx.amountCents);
    }

    if (normInv && profile.invoiceByNorm.has(normInv)) {
      const inv = profile.invoiceByNorm.get(normInv)!;
      if (tx.kind === "payment") {
        inv.paidCents += Math.abs(tx.amountCents);
      } else if (tx.kind === "return_refund") {
        inv.paidCents -= Math.abs(tx.amountCents);
      }
      inv.balanceDueCents = Math.max(0, inv.invoicedCents - inv.paidCents);
    } else if (
      normInv &&
      tx.kind === "payment" &&
      name &&
      !profile.invoiceByNorm.has(normInv)
    ) {
      profile.invoiceByNorm.set(normInv, {
        invoiceNumber: tx.invoiceReference!.trim(),
        orderId: null,
        orderDate: tx.recordedAt.slice(0, 10),
        orderStatus: null,
        location: null,
        invoicedCents: 0,
        paidCents: Math.abs(tx.amountCents),
        balanceDueCents: 0,
        salesEmployeeId: tx.salesEmployeeId ?? null,
        salesAgentName: tx.salesAgentName ?? null,
        daysOutstanding: daysSinceDate(tx.recordedAt),
        settlementStatus: null,
        paymentMethodRaw: null,
        paymentMethod: null,
        settlementPaidAmountCents: null,
        prodataTransactionDate: null,
      });
    }
  }

  for (const profile of profiles.values()) {
    for (const inv of profile.invoiceByNorm.values()) {
      inv.balanceDueCents = Math.max(0, inv.invoicedCents - inv.paidCents);
      if (inv.orderDate) {
        inv.daysOutstanding = daysSinceDate(inv.orderDate);
      }
    }
  }

  return [...profiles.values()]
    .map(finalizeProfile)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getClientFinanceProfile(
  organizationId: number,
  clientKey: string
): Promise<ClientFinanceProfile | null> {
  const key = normalizeClientKey(clientKey);
  const all = await buildClientFinanceProfiles(organizationId);
  return all.find((p) => p.clientKey === key) ?? null;
}

function profileHasTraceableInvoices(profile: ClientFinanceProfile): boolean {
  return profile.invoices.some((inv) => inv.invoiceNumber.trim().length > 0);
}

export function listDebts(profiles: ClientFinanceProfile[]) {
  return profiles
    .filter(
      (p) =>
        p.balanceDueCents > 0 &&
        profileHasTraceableInvoices(p) &&
        p.invoices.some(
          (inv) => inv.balanceDueCents > 0 && inv.invoiceNumber.trim()
        )
    )
    .sort((a, b) => b.balanceDueCents - a.balanceDueCents);
}

export function listCallQueue(profiles: ClientFinanceProfile[]) {
  return profiles
    .filter(
      (p) =>
        p.callReasons.length > 0 &&
        profileHasTraceableInvoices(p) &&
        (p.balanceDueCents <= 0 ||
          p.invoices.some(
            (inv) =>
              inv.balanceDueCents > 0 &&
              inv.invoiceNumber.trim() &&
              invoiceRowHasSalesAgent(inv)
          ))
    )
    .sort((a, b) => b.balanceDueCents - a.balanceDueCents);
}

export function findClientsByInvoice(
  profiles: ClientFinanceProfile[],
  invoiceNumber: string
) {
  return profiles.filter((p) =>
    p.invoices.some((inv) =>
      invoiceReferencesMatch(inv.invoiceNumber, invoiceNumber)
    )
  );
}

function debtInvoiceItems(
  profiles: ClientFinanceProfile[],
  options: { minDaysOutstanding?: number; requireOrderDate?: boolean }
): OverdueDebtItem[] {
  const minDays = options.minDaysOutstanding ?? 0;
  const requireOrderDate = options.requireOrderDate ?? minDays > 0;
  const items: OverdueDebtItem[] = [];
  for (const profile of profiles) {
    for (const inv of profile.invoices) {
      if (!inv.invoiceNumber.trim()) continue;
      if (!invoiceRowHasSalesAgent(inv)) continue;
      if (inv.balanceDueCents <= 0) continue;
      if (minDays > 0 && inv.daysOutstanding < minDays) continue;
      if (requireOrderDate && !inv.orderDate) continue;
      items.push({
        clientKey: profile.clientKey,
        displayName: profile.displayName,
        invoiceNumber: inv.invoiceNumber,
        balanceDueCents: inv.balanceDueCents,
        invoicedCents: inv.invoicedCents,
        orderDate: inv.orderDate ?? "",
        daysOutstanding: inv.daysOutstanding,
        salesEmployeeId: inv.salesEmployeeId,
        salesAgentName:
          inv.salesAgentName?.trim() ||
          (inv.salesEmployeeId != null
            ? `Agent #${inv.salesEmployeeId}`
            : ""),
        orderStatus: inv.orderStatus,
        location: inv.location,
        settlementStatus: inv.settlementStatus,
        paymentMethodRaw: inv.paymentMethodRaw,
        paymentMethod: inv.paymentMethod,
        settlementPaidAmountCents: inv.settlementPaidAmountCents,
        prodataTransactionDate: inv.prodataTransactionDate,
      });
    }
  }
  return items.sort((a, b) => b.balanceDueCents - a.balanceDueCents);
}

export function filterDebtItemsForBusinessDay<
  T extends {
    prodataTransactionDate: string | null;
    orderDate: string;
  },
>(items: T[], businessDay: string | null): T[] {
  const day = businessDay?.trim().slice(0, 10);
  if (!day) return items;
  return items.filter((row) =>
    invoiceMatchesBusinessDay(row.prodataTransactionDate, row.orderDate, day)
  );
}

export function filterProfilesForBusinessDay(
  profiles: ClientFinanceProfile[],
  businessDay: string | null
): ClientFinanceProfile[] {
  const day = businessDay?.trim().slice(0, 10);
  if (!day) return profiles;
  return profiles
    .map((p) => ({
      ...p,
      invoices: p.invoices.filter((inv) =>
        invoiceMatchesBusinessDay(
          inv.prodataTransactionDate,
          inv.orderDate,
          day
        )
      ),
    }))
    .filter((p) => p.invoices.some((inv) => inv.invoiceNumber.trim()));
}

/** Every open invoice with balance due (traceable invoice + agent). */
export function listOpenDebtInvoices(
  profiles: ClientFinanceProfile[]
): OverdueDebtItem[] {
  return debtInvoiceItems(profiles, {
    minDaysOutstanding: 0,
    requireOrderDate: false,
  });
}

export function listOverdueDebts(
  profiles: ClientFinanceProfile[],
  minDays = 14
): OverdueDebtItem[] {
  return debtInvoiceItems(profiles, {
    minDaysOutstanding: minDays,
    requireOrderDate: true,
  });
}

export type ReceivablesSummary = {
  totalDebtCents: number;
  openInvoiceCount: number;
  clientsWithDebt: number;
  totalInvoicedCents: number;
  totalPaidOnInvoicesCents: number;
  overdue14Count: number;
  overdue14Cents: number;
};

export function computeReceivablesSummary(
  profiles: ClientFinanceProfile[]
): ReceivablesSummary {
  const debts = listDebts(profiles);
  const openLines = listOpenDebtInvoices(profiles);
  const overdue14 = listOverdueDebts(profiles, 14);
  let totalInvoicedCents = 0;
  let totalPaidOnInvoicesCents = 0;
  for (const p of profiles) {
    totalInvoicedCents += p.totalInvoicedCents;
    totalPaidOnInvoicesCents += p.totalPaidCents;
  }
  return {
    totalDebtCents: openLines.reduce((s, i) => s + i.balanceDueCents, 0),
    openInvoiceCount: openLines.length,
    clientsWithDebt: debts.length,
    totalInvoicedCents,
    totalPaidOnInvoicesCents,
    overdue14Count: overdue14.length,
    overdue14Cents: overdue14.reduce((s, i) => s + i.balanceDueCents, 0),
  };
}

export function groupDebtInvoicesByAgent(
  items: OverdueDebtItem[]
): AgentDebtGroup[] {
  return groupOverdueDebtsByAgent(items);
}

export function groupOverdueDebtsByAgent(
  overdue: OverdueDebtItem[]
): AgentDebtGroup[] {
  const map = new Map<string, AgentDebtGroup>();
  for (const item of overdue) {
    const key =
      item.salesEmployeeId != null
        ? `e-${item.salesEmployeeId}`
        : `n-${item.salesAgentName}`;
    let group = map.get(key);
    if (!group) {
      group = {
        salesEmployeeId: item.salesEmployeeId,
        salesAgentName: item.salesAgentName,
        totalDueCents: 0,
        overdueDueCents: 0,
        clientCount: 0,
        items: [],
      };
      map.set(key, group);
    }
    group.items.push(item);
    group.overdueDueCents += item.balanceDueCents;
    group.totalDueCents += item.balanceDueCents;
  }
  for (const group of map.values()) {
    group.clientCount = new Set(group.items.map((i) => i.clientKey)).size;
    group.items.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
  }
  return [...map.values()].sort(
    (a, b) => b.overdueDueCents - a.overdueDueCents
  );
}
