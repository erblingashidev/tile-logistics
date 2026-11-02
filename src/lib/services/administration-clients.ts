import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { invoiceReferencesMatch } from "@/lib/administration/validation";
import { listRegisterTransactions } from "@/lib/services/administration-register";

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
};

export type AgentDebtGroup = {
  salesEmployeeId: number | null;
  salesAgentName: string;
  totalDueCents: number;
  overdueDueCents: number;
  clientCount: number;
  items: OverdueDebtItem[];
};

const UNASSIGNED_AGENT = "Unassigned agent";

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
  profile.invoices = [...profile.invoiceByNorm.values()].sort((a, b) =>
    (b.orderDate ?? "").localeCompare(a.orderDate ?? "")
  );
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

  const reasons = new Set<string>();
  if (profile.balanceDueCents > 0) {
    reasons.add("Outstanding balance on invoice(s)");
  }
  if (profile.unpaidOnAccountCents > 0) {
    reasons.add("Unpaid / on account recorded in register");
  }
  const deliveredUnpaid = profile.invoices.some(
    (inv) =>
      inv.balanceDueCents > 0 &&
      (inv.orderStatus === "delivered" || inv.orderStatus === "completed")
  );
  if (deliveredUnpaid) {
    reasons.add("Delivered order not fully paid");
  }
  const overdue = profile.invoices.some(
    (inv) => inv.balanceDueCents > 0 && inv.daysOutstanding >= 14
  );
  if (overdue) {
    reasons.add("Unpaid over 14 days");
  }
  profile.callReasons = [...reasons];

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

  function getProfile(name: string): ProfileMutable {
    const key = normalizeClientKey(name);
    if (!key) throw new Error("Invalid client name");
    let profile = profiles.get(key);
    if (!profile) {
      profile = emptyProfile(key, name.trim());
      profiles.set(key, profile);
    } else {
      profile.displayName = pickDisplayName(profile.displayName, name);
    }
    return profile;
  }

  for (const order of orderRows) {
    const profile = getProfile(order.customerName);
    const normInv = normalizeInvoiceRef(order.invoiceNumber);
    invoiceOwner.set(normInv, profile.clientKey);
    const invoicedCents = Math.round(Number(order.price) * 100);
    const row: ClientInvoiceRow = {
      invoiceNumber: order.invoiceNumber,
      orderId: order.id,
      orderDate: order.orderDate,
      orderStatus: order.status,
      location: order.location,
      invoicedCents,
      paidCents: 0,
      balanceDueCents: invoicedCents,
      salesEmployeeId: order.salesEmployeeId ?? null,
      salesAgentName: order.salesAgentName?.trim() || null,
      daysOutstanding: daysSinceDate(order.orderDate),
    };
    profile.invoiceByNorm.set(normInv, row);
    touchActivity(profile, order.orderDate);
  }

  for (const tx of registerRows) {
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
    const normInv = normalizeInvoiceRef(tx.invoiceReference);
    let clientKey = normInv ? invoiceOwner.get(normInv) : undefined;
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

export function listDebts(profiles: ClientFinanceProfile[]) {
  return profiles
    .filter((p) => p.balanceDueCents > 0)
    .sort((a, b) => b.balanceDueCents - a.balanceDueCents);
}

export function listCallQueue(profiles: ClientFinanceProfile[]) {
  return profiles
    .filter((p) => p.callReasons.length > 0)
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

export function listOverdueDebts(
  profiles: ClientFinanceProfile[],
  minDays = 14
): OverdueDebtItem[] {
  const items: OverdueDebtItem[] = [];
  for (const profile of profiles) {
    for (const inv of profile.invoices) {
      if (inv.balanceDueCents <= 0) continue;
      if (inv.daysOutstanding < minDays) continue;
      if (!inv.orderDate) continue;
      items.push({
        clientKey: profile.clientKey,
        displayName: profile.displayName,
        invoiceNumber: inv.invoiceNumber,
        balanceDueCents: inv.balanceDueCents,
        invoicedCents: inv.invoicedCents,
        orderDate: inv.orderDate,
        daysOutstanding: inv.daysOutstanding,
        salesEmployeeId: inv.salesEmployeeId,
        salesAgentName: inv.salesAgentName?.trim() || UNASSIGNED_AGENT,
        orderStatus: inv.orderStatus,
        location: inv.location,
      });
    }
  }
  return items.sort((a, b) => b.daysOutstanding - a.daysOutstanding);
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
