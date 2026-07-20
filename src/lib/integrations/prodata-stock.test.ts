import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  parseProDataStockExcel,
  resolveProDataLocation,
} from "@/lib/integrations/prodata-stock";

describe("parseProDataStockExcel", () => {
  it("maps known Pro-Data warehouse names to stable codes", () => {
    expect(resolveProDataLocation("Depoja Kryesore Shkabaj").code).toBe(
      "PRODATA-MAIN"
    );
    expect(resolveProDataLocation("Depo e Mallit te Rezervuar").code).toBe(
      "PRODATA-RESERVED"
    );
  });

  it("parses and aggregates the real Pro-Data stock export", () => {
    const path = "/Users/apple/Downloads/Pro-Data-13072026-145752.xlsx";
    let buffer: Buffer;
    try {
      buffer = readFileSync(path);
    } catch {
      // File only present on the machine that exported Pro-Data.
      return;
    }

    const parsed = parseProDataStockExcel(buffer);
    expect(parsed.warnings.some((w) => /Unrecognized/i.test(w))).toBe(false);
    expect(parsed.rows.length).toBeGreaterThan(1000);
    expect(parsed.locationNames).toContain("Depoja Kryesore Shkabaj");

    const multi = parsed.rows.filter((r) => r.barcode === "10157043");
    expect(multi.length).toBeGreaterThanOrEqual(2);
    const reserved = multi.find((r) =>
      /Rezervuar/i.test(r.locationName)
    );
    const main = multi.find((r) => /Shkabaj/i.test(r.locationName));
    expect(reserved?.quantity).toBeGreaterThan(0);
    expect(main?.quantity).toBeGreaterThan(0);
  });

  it("rejects unrelated excel shapes", () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["A", "B"],
      [1, 2],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const parsed = parseProDataStockExcel(buffer);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.warnings[0]).toMatch(/Unrecognized/i);
  });
});
