/**
 * Live Pro-Data API smoke test (read-only unless --push-order is passed).
 *
 * Loads `.env.local` automatically. Required vars:
 *   PRODATA_SYNC_ENABLED=true
 *   PRODATA_API_URL=http://office2.prodata-ks.com:8080/RestAPI
 *   PRODATA_API_USERNAME=prodata
 *   PRODATA_API_PASSWORD=...
 *
 * Usage:
 *   npm run test:prodata-api
 *
 * Optional flags:
 *   --push-order     POST a tiny test order and compare stock before/after
 */
import { loadEnvLocal } from "./load-env-local";

loadEnvLocal();

async function main() {
  const {
    fetchProDataItemsStoku,
    parseProDataItemsStoku,
    postProDataBulkOrder,
    testProDataConnection,
  } = await import("../src/lib/integrations/prodata-api");

  const args = new Set(process.argv.slice(2));
  const pushOrder = args.has("--push-order");

  console.log("=== Pro-Data API connection ===");
  console.log("PRODATA_SYNC_ENABLED =", process.env.PRODATA_SYNC_ENABLED ?? "(unset)");
  const conn = await testProDataConnection();
  console.log(conn);

  if (!conn.ok) {
    process.exit(1);
  }

  if (!pushOrder) {
    console.log("\nStock warehouses:", conn.warehouses?.join(", ") ?? "(none)");
    console.log("\nDone (read-only). Pass --push-order to test order → stock on Pro-Data side.");
    return;
  }

  const before = await fetchProDataItemsStoku();
  const beforeParsed = parseProDataItemsStoku(before);
  const sample = beforeParsed.rows.find((r) => r.quantity > 0);
  if (!sample) {
    console.error("No stock line with quantity > 0 to test order push.");
    process.exit(1);
  }

  console.log("\n=== Order push test ===");
  console.log("Sample item:", sample.barcode, sample.productName, sample.quantity);

  const qty = Math.min(1, sample.quantity);
  const result = await postProDataBulkOrder([
    {
      ItemCode: sample.barcode,
      Quantity: qty,
      Price: 1,
      Discount: 0,
      PriceAfterDiscount: 1,
      VariantCode1: "",
      VariantCode2: "",
    },
  ]);
  console.log("Post order result:", result);

  const after = await fetchProDataItemsStoku({ itemCode: sample.barcode });
  const afterParsed = parseProDataItemsStoku(after);
  const afterLine = afterParsed.rows.find(
    (r) => r.barcode === sample.barcode && r.locationName === sample.locationName
  );

  console.log("\nStock before:", sample.quantity, "at", sample.locationName);
  console.log("Stock after:", afterLine?.quantity ?? 0);
  console.log(
    afterLine && afterLine.quantity < sample.quantity
      ? "Pro-Data decremented stock after order."
      : "Stock unchanged (order may have failed or Pro-Data does not auto-decrement on test DB)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
