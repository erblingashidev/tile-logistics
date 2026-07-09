import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");

// Use Next/ts path alias workaround: run via compiled output isn't available,
// so invoke the parser through a tiny dynamic import of the TS source using node --experimental...
// Instead duplicate minimal runner by spawning next build output - simplest: use jiti-free approach
// with register hook from ts-node if present. Fall back to reading xlsx only for CI.

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node scripts/test-excel-invoice.mjs <file.xlsx>");
    process.exit(1);
  }

  const { register } = await import("tsx/esm/api");
  register();

  const { parseAgimiExcel } = await import(
    path.join(projectRoot, "src/lib/invoices/parse-agimi-excel.ts")
  );
  const buf = fs.readFileSync(filePath);
  const parsed = parseAgimiExcel(buf);

  console.log("Invoice:", parsed.invoiceNumber || "(missing)");
  console.log("Referenti:", parsed.salesAgent ?? "(missing)");
  console.log("Customer:", parsed.customerName);
  console.log("Price:", parsed.price);
  console.log("Items:", parsed.items.length);
  console.log("Warnings:", parsed.warnings.join(" | "));
  for (const item of parsed.items) {
    const qty = item.quantityM2 ?? item.weightKg ?? item.lengthM ?? item.manualPieces;
    console.log(
      ` - ${item.productEan ?? "—"} | ${item.productName?.slice(0, 72) ?? "—"} | ${qty} ${item.unit}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
