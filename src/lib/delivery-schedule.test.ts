import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  pastWorkDateCompletionNote,
  proofCapturedAtTimestamp,
  statusChangeTimestamp,
  todayDateString,
} from "@/lib/delivery-schedule";

const localNoon = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

describe("statusChangeTimestamp", () => {
  it("keeps completion on yesterday when the order is still on yesterday's list", () => {
    const today = todayDateString(localNoon("2026-08-19"));
    const yesterday = addDaysToDateString(today, -1);
    const ts = statusChangeTimestamp(
      { orderDate: yesterday, requestedDeliveryDate: yesterday },
      "delivered",
      localNoon("2026-08-19")
    );
    expect(ts.slice(0, 10)).toBe(yesterday);
  });

  it("uses today after the order is rescheduled to today", () => {
    const asOf = localNoon("2026-08-19");
    const ts = statusChangeTimestamp(
      { orderDate: "2026-08-18", requestedDeliveryDate: "2026-08-19" },
      "delivered",
      asOf
    );
    expect(ts).toBe(asOf.toISOString());
  });

  it("does not backdate non-completion status changes", () => {
    const asOf = localNoon("2026-08-19");
    const ts = statusChangeTimestamp(
      { orderDate: "2026-08-18", requestedDeliveryDate: "2026-08-18" },
      "assigned",
      asOf
    );
    expect(ts).toBe(asOf.toISOString());
  });
});

describe("proofCapturedAtTimestamp", () => {
  it("backdates delivered proofs to the scheduled work day", () => {
    const ts = proofCapturedAtTimestamp(
      { orderDate: "2026-08-18", requestedDeliveryDate: "2026-08-18" },
      "delivered",
      localNoon("2026-08-19")
    );
    expect(ts.slice(0, 10)).toBe("2026-08-18");
  });

  it("leaves warehouse step times on the day they were recorded", () => {
    const asOf = localNoon("2026-08-19");
    const ts = proofCapturedAtTimestamp(
      { orderDate: "2026-08-18", requestedDeliveryDate: "2026-08-18" },
      "loaded",
      asOf
    );
    expect(ts).toBe(asOf.toISOString());
  });
});

describe("pastWorkDateCompletionNote", () => {
  it("explains yesterday completion vs reschedule-to-today", () => {
    const note = pastWorkDateCompletionNote(
      { orderDate: "2026-08-18", requestedDeliveryDate: "2026-08-18" },
      localNoon("2026-08-19")
    );
    expect(note).toMatch(/yesterday/i);
    expect(note).toMatch(/reschedule/i);
  });

  it("is silent for today's list", () => {
    const note = pastWorkDateCompletionNote(
      { orderDate: "2026-08-19", requestedDeliveryDate: "2026-08-19" },
      localNoon("2026-08-19")
    );
    expect(note).toBeNull();
  });
});
