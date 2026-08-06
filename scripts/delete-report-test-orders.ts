/**
 * Remove report test orders (invoice prefix RPT-).
 *
 *   npm run delete:report-orders:local
 *   npm run delete:report-orders
 */
import { like } from "drizzle-orm";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
} from "./db-target";
import { getDb } from "../src/lib/db";
import { dbAll } from "../src/lib/db/query";
import { orders } from "../src/lib/db/schema";
import { deleteOrder } from "../src/lib/services/orders";

const TEST_INVOICE_PREFIX = "RPT-";

configureScriptDatabase();

async function main() {
  console.log(
    `\n=== Delete report test orders → ${describeScriptDatabaseTarget()} ===\n`
  );

  const db = await getDb();
  const matches = await dbAll(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(like(orders.invoiceNumber, `${TEST_INVOICE_PREFIX}%`))
  );

  if (matches.length === 0) {
    console.log(`No orders with prefix ${TEST_INVOICE_PREFIX} found.`);
    return;
  }

  let deleted = 0;
  for (const row of matches) {
    const ok = await deleteOrder(row.id);
    if (ok) {
      deleted += 1;
      console.log(`  − ${row.invoiceNumber}`);
    }
  }

  console.log(`\nDeleted ${deleted} test order(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
