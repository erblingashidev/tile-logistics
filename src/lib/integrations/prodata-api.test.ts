import { describe, expect, it } from "vitest";
import { parseProDataItemsStoku } from "@/lib/integrations/prodata-api";
import {
  parseProDataStockExcel,
  resolveProDataLocation,
} from "@/lib/integrations/prodata-stock";

describe("parseProDataItemsStoku", () => {
  it("maps API warehouse rows to the same shape as Excel import", () => {
    const parsed = parseProDataItemsStoku([
      {
        code: "TILE-001",
        barcode: "810000123456",
        description: "Tile 60x60",
        warehouses: [
          { warehouse: "Depoja Kryesore", quantityAvailable: 51 },
          { warehouse: "Depo e Mallit te Rezervuar", quantityAvailable: 12 },
        ],
      },
      {
        code: "TILE-001",
        barcode: "810000123456",
        description: "Tile 60x60",
        warehouses: [{ warehouse: "Depoja Kryesore Shkabaj", quantityAvailable: 3 }],
      },
    ]);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.locationNames).toEqual(
      expect.arrayContaining([
        "Depoja Kryesore",
        "Depo e Mallit te Rezervuar",
        "Depoja Kryesore Shkabaj",
      ])
    );

    const main = parsed.rows.find(
      (r) => r.locationName === "Depoja Kryesore" && r.barcode === "810000123456"
    );
    expect(main?.quantity).toBe(51);
    expect(main?.articleCode).toBe("TILE-001");

    expect(resolveProDataLocation("Depoja Kryesore").code).toBe("PRODATA-MAIN");
  });

  it("skips items without barcode or warehouse", () => {
    const parsed = parseProDataItemsStoku([
      {
        code: "",
        barcode: "",
        description: "No barcode",
        warehouses: [{ warehouse: "Depoja Kryesore", quantityAvailable: 1 }],
      },
      {
        code: "X",
        barcode: "123",
        description: "No warehouse",
        warehouses: [],
      },
    ]);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });
});

describe("parseProDataStockExcel", () => {
  it("maps known Pro-Data warehouse names to stable codes", () => {
    expect(resolveProDataLocation("Depoja Kryesore Shkabaj").code).toBe(
      "PRODATA-MAIN"
    );
    expect(resolveProDataLocation("Depoja Kryesore").code).toBe("PRODATA-MAIN");
    expect(resolveProDataLocation("Depo e Mallit te Rezervuar").code).toBe(
      "PRODATA-RESERVED"
    );
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
