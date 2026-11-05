import { describe, expect, it } from "vitest";
import {
  buildClientCallReasons,
  CALL_LIST_STALE_DAYS,
  CALL_REASON_STALE,
} from "@/lib/administration/call-list";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("buildClientCallReasons", () => {
  it("does not call-list when balance is zero", () => {
    expect(
      buildClientCallReasons({
        balanceDueCents: 0,
        lastActivityAt: daysAgo(10),
        registerLines: [],
        invoices: [],
      })
    ).toEqual([]);
  });

  it("does not call-list when activity is recent", () => {
    expect(
      buildClientCallReasons({
        balanceDueCents: 1000,
        lastActivityAt: daysAgo(0),
        registerLines: [],
        invoices: [
          {
            invoiceNumber: "26-A",
            orderId: 1,
            orderDate: daysAgo(5),
            orderStatus: null,
            location: null,
            invoicedCents: 1000,
            paidCents: 0,
            balanceDueCents: 1000,
            salesEmployeeId: 1,
            salesAgentName: "Agent",
            daysOutstanding: 5,
            settlementStatus: null,
            paymentMethodRaw: null,
            paymentMethod: null,
            settlementPaidAmountCents: null,
          },
        ],
      })
    ).toEqual([]);
  });

  it(`adds stale reason after ${CALL_LIST_STALE_DAYS}+ days without payment or update`, () => {
    const reasons = buildClientCallReasons({
      balanceDueCents: 5000,
      lastActivityAt: daysAgo(CALL_LIST_STALE_DAYS + 1),
      registerLines: [],
      invoices: [
        {
          invoiceNumber: "26-B",
          orderId: 2,
          orderDate: daysAgo(CALL_LIST_STALE_DAYS + 3),
          orderStatus: "delivered",
          location: null,
          invoicedCents: 5000,
          paidCents: 0,
          balanceDueCents: 5000,
          salesEmployeeId: 1,
          salesAgentName: "Agent",
          daysOutstanding: 5,
          settlementStatus: "unpaid",
          paymentMethodRaw: null,
          paymentMethod: null,
          settlementPaidAmountCents: null,
        },
      ],
    });
    expect(reasons[0]).toBe(CALL_REASON_STALE);
    expect(reasons).toContain("Delivered order not fully paid");
  });
});
