import { describe, expect, it } from "vitest";
import { invoiceMatchesAssignmentBusinessDay } from "@/lib/administration/business-day";

describe("invoiceMatchesAssignmentBusinessDay", () => {
  const today = "2026-03-05";

  it("includes same-day transactions", () => {
    expect(
      invoiceMatchesAssignmentBusinessDay("2026-03-05", "2026-03-05", today)
    ).toBe(true);
  });

  it("includes older unassigned backlog when viewing today", () => {
    expect(
      invoiceMatchesAssignmentBusinessDay("2026-01-10", "2026-03-05", today)
    ).toBe(true);
  });

  it("excludes older dates when viewing a past business day", () => {
    expect(
      invoiceMatchesAssignmentBusinessDay("2026-01-10", "2026-03-02", today)
    ).toBe(false);
  });

  it("includes all days when business day filter is omitted", () => {
    expect(
      invoiceMatchesAssignmentBusinessDay("2026-01-10", null, today)
    ).toBe(true);
  });
});
