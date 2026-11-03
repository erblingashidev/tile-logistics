import { describe, expect, it } from "vitest";
import {
  debtInvoiceMatchesSearch,
  clientProfileMatchesSearch,
} from "@/lib/administration/finance-search";
import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";

const sampleRow: DebtInvoiceLine = {
  clientKey: "acl sh.p.k.",
  displayName: "ACL SH.P.K.",
  invoiceNumber: "26-SHV01-001-13161",
  balanceDueCents: 50000,
  invoicedCents: 100000,
  orderDate: "2026-11-02",
  daysOutstanding: 3,
  salesEmployeeId: null,
  salesAgentName: "KUSHTRIM VULA",
  orderStatus: "delivered",
  location: "PR",
};

describe("finance search", () => {
  it("matches invoice fragments and agent tokens", () => {
    expect(debtInvoiceMatchesSearch(sampleRow, "13161")).toBe(true);
    expect(debtInvoiceMatchesSearch(sampleRow, "shv01 kushtrim")).toBe(true);
    expect(debtInvoiceMatchesSearch(sampleRow, "unknown xyz")).toBe(false);
  });

  it("matches client profiles by nested invoice", () => {
    expect(
      clientProfileMatchesSearch(
        {
          clientKey: "acl",
          displayName: "ACL SH.P.K.",
          totalInvoicedCents: 0,
          totalPaidCents: 0,
          balanceDueCents: 0,
          unpaidOnAccountCents: 0,
          invoiceCount: 1,
          paymentCount: 0,
          lastActivityAt: null,
          callReasons: [],
          invoices: [
            {
              invoiceNumber: "26-SHV01-001-999",
              orderId: null,
              orderDate: "2026-11-02",
              orderStatus: null,
              location: null,
              invoicedCents: 100,
              paidCents: 0,
              balanceDueCents: 100,
              salesEmployeeId: null,
              salesAgentName: "Endrit Osmani",
              daysOutstanding: 1,
            },
          ],
          registerLines: [],
          paymentMethodTotals: [],
        },
        "999 endrit"
      )
    ).toBe(true);
  });
});
