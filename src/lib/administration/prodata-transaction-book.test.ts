import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  financeDocumentCategory,
  mapProDataPaymentMethod,
  parseProDataTransactionBook,
} from "@/lib/administration/prodata-transaction-book";

function buildMiniWorkbook(rows: unknown[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pro-Data Export");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("prodata transaction book", () => {
  it("classifies SHV sales and NOKR credit notes", () => {
    expect(financeDocumentCategory("26-SHV01-001-13161", 622.08)).toBe("sale");
    expect(financeDocumentCategory("26-NOKR2-001-1919", -92.27)).toBe(
      "credit_note"
    );
  });

  it("maps Albanian payment labels", () => {
    expect(mapProDataPaymentMethod("Arke")).toBe("cash");
    expect(mapProDataPaymentMethod("Kartë")).toBe("card");
    expect(mapProDataPaymentMethod("")).toBe(null);
  });

  it("aggregates lines by invoice", () => {
    const buffer = buildMiniWorkbook([
      [
        "Transaksioni",
        "Data",
        "Bleres",
        "Shifra",
        "Emertimi",
        "Agjenti Tregtar",
        "Sasia",
        "Njesia Matese",
        "Cmimi_Shit",
        "Vlera_shit",
        "MENYRA E PAGESES",
      ],
      [
        "26-SHV01-001-100",
        "2026-11-02",
        "ACL SH.P.K.",
        "1300046641",
        "Tile A",
        "Agent One",
        10,
        "M2",
        9,
        90,
        "Arke",
      ],
      [
        "26-SHV01-001-100",
        "2026-11-02",
        "ACL SH.P.K.",
        "1300046405",
        "Tile B",
        "Agent One",
        5,
        "M2",
        9,
        45,
        "Arke",
      ],
      [
        "26-NOKR2-001-200",
        "2026-11-02",
        "Client X",
        "1300042968",
        "Return line",
        "Agent Two",
        -1,
        "M2",
        18,
        -18,
        "",
      ],
    ]);

    const analysis = parseProDataTransactionBook(buffer, "test.xlsx");
    expect(analysis.rowCount).toBe(3);
    expect(analysis.invoices).toHaveLength(2);
    const sale = analysis.invoices.find(
      (i) => i.invoiceNumber === "26-SHV01-001-100"
    );
    expect(sale?.netValueEuros).toBe(135);
    expect(sale?.documentCategory).toBe("sale");
    expect(sale?.paymentMethod).toBe("cash");
    expect(analysis.byCategory.sale.count).toBe(1);
    expect(analysis.byCategory.credit_note.count).toBe(1);
  });
});
