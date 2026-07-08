import fs from "fs";
import { parseAgimiInvoice } from "../src/lib/invoices/parse-agimi-invoice";

const textPath = process.argv[2] ?? ".tmp/invoice-7193.txt";
const text = fs.readFileSync(textPath, "utf8");
const parsed = parseAgimiInvoice(text);

console.log("Invoice:", parsed.invoiceNumber);
console.log("Referenti:", parsed.salesAgent ?? "(missing)");
console.log("Customer:", parsed.customerName);
console.log("Price:", parsed.price);
console.log("Items:", parsed.items.length);
console.log("Warnings:", parsed.warnings.join(" | "));
for (const item of parsed.items) {
  const qty = item.quantityM2 ?? item.weightKg ?? item.manualPieces;
  console.log(
    ` - ${item.productEan ?? "—"} | ${item.productName?.slice(0, 72) ?? "—"} | ${qty} ${item.unit}`
  );
}
