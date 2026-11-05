import { describe, expect, it } from "vitest";
import {
  detectExcelLineConflicts,
  invoiceMatchesBusinessDay,
} from "@/lib/administration/prodata-invoice-conflicts";

describe("detectExcelLineConflicts", () => {
  it("flags same invoice with different buyers", () => {
    const conflicts = detectExcelLineConflicts([
      {
        invoiceNumber: "26-A",
        transactionDate: "2026-03-01",
        buyerName: "Alpha",
        productCode: "",
        description: "",
        salesAgentName: "Agent",
        quantity: 1,
        unit: "",
        unitPrice: 10,
        lineValueEuros: 10,
        paymentMethodRaw: "",
      },
      {
        invoiceNumber: "26-A",
        transactionDate: "2026-03-01",
        buyerName: "Beta",
        productCode: "",
        description: "",
        salesAgentName: "Agent",
        quantity: 1,
        unit: "",
        unitPrice: 5,
        lineValueEuros: 5,
        paymentMethodRaw: "Cash",
      },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.invoiceNumber).toBe("26-A");
    expect(conflicts[0]?.variants.length).toBeGreaterThan(1);
  });
});

describe("invoiceMatchesBusinessDay", () => {
  it("matches pro-data transaction date", () => {
    expect(
      invoiceMatchesBusinessDay("2026-03-02T00:00:00", null, "2026-03-02")
    ).toBe(true);
  });
});
