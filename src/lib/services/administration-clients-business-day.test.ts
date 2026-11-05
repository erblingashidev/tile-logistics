import { describe, expect, it } from "vitest";
import type { ClientFinanceProfile } from "@/lib/services/administration-clients";
import {
  filterProfilesForBusinessDay,
  listDebts,
  listOpenDebtInvoices,
} from "@/lib/services/administration-clients";

function profile(
  partial: Partial<ClientFinanceProfile> & Pick<ClientFinanceProfile, "clientKey">
): ClientFinanceProfile {
  return {
    displayName: partial.displayName ?? partial.clientKey,
    totalInvoicedCents: partial.totalInvoicedCents ?? 0,
    totalPaidCents: partial.totalPaidCents ?? 0,
    balanceDueCents: partial.balanceDueCents ?? 0,
    unpaidOnAccountCents: 0,
    invoiceCount: partial.invoiceCount ?? 0,
    paymentCount: 0,
    lastActivityAt: null,
    registerLines: [],
    paymentMethodTotals: [],
    callReasons: [],
    invoices: partial.invoices ?? [],
    ...partial,
  };
}

describe("filterProfilesForBusinessDay", () => {
  it("recomputes balance from invoices on the selected day only", () => {
    const clients = [
      profile({
        clientKey: "acme",
        balanceDueCents: 50_000,
        totalInvoicedCents: 50_000,
        invoices: [
          {
            invoiceNumber: "OLD-1",
            orderId: null,
            orderDate: "2026-01-10",
            orderStatus: null,
            location: null,
            invoicedCents: 50_000,
            paidCents: 0,
            balanceDueCents: 50_000,
            salesEmployeeId: null,
            salesAgentName: "Agent",
            daysOutstanding: 30,
            settlementStatus: null,
            paymentMethodRaw: null,
            paymentMethod: null,
            settlementPaidAmountCents: null,
            prodataTransactionDate: "2026-01-10",
          },
          {
            invoiceNumber: "TODAY-1",
            orderId: null,
            orderDate: "2026-03-02",
            orderStatus: null,
            location: null,
            invoicedCents: 10_000,
            paidCents: 10_000,
            balanceDueCents: 0,
            salesEmployeeId: null,
            salesAgentName: "Agent",
            daysOutstanding: 0,
            settlementStatus: "paid",
            paymentMethodRaw: "Cash",
            paymentMethod: "cash",
            settlementPaidAmountCents: 10_000,
            prodataTransactionDate: "2026-03-02",
          },
        ],
      }),
    ];

    const scoped = filterProfilesForBusinessDay(clients, "2026-03-02");
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.balanceDueCents).toBe(0);
    expect(listDebts(scoped)).toHaveLength(0);
    expect(listOpenDebtInvoices(scoped)).toHaveLength(0);
  });

  it("keeps open debt when the business-day invoice still has balance", () => {
    const clients = [
      profile({
        clientKey: "beta",
        balanceDueCents: 80_000,
        invoices: [
          {
            invoiceNumber: "26-SHV01",
            orderId: null,
            orderDate: "2026-03-02",
            orderStatus: null,
            location: null,
            invoicedCents: 30_000,
            paidCents: 0,
            balanceDueCents: 30_000,
            salesEmployeeId: 1,
            salesAgentName: "Agent",
            daysOutstanding: 0,
            settlementStatus: null,
            paymentMethodRaw: null,
            paymentMethod: null,
            settlementPaidAmountCents: null,
            prodataTransactionDate: "2026-03-02",
          },
        ],
      }),
    ];

    const scoped = filterProfilesForBusinessDay(clients, "2026-03-02");
    expect(scoped[0]?.balanceDueCents).toBe(30_000);
    expect(listDebts(scoped)).toHaveLength(1);
    expect(listOpenDebtInvoices(scoped)).toHaveLength(1);
  });
});
