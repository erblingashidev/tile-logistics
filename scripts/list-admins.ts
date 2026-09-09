import { configureScriptDatabase, describeScriptDatabaseTarget } from "./db-target";
import { getDb } from "../src/lib/db";
import { dbAll } from "../src/lib/db/query";
import { admins } from "../src/lib/db/schema";

configureScriptDatabase();

async function main() {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: admins.id,
        username: admins.username,
        name: admins.name,
        isActive: admins.isActive,
        isPlatformAdmin: admins.isPlatformAdmin,
        organizationId: admins.organizationId,
      })
      .from(admins)
      .orderBy(admins.id)
  );
  console.log(`Admins on ${describeScriptDatabaseTarget()}:\n`);
  for (const row of rows) {
    console.log(
      `- #${row.id} @${row.username} (${row.name}) active=${row.isActive === 1} platform=${row.isPlatformAdmin === 1} org=${row.organizationId ?? "null"}`
    );
  }
  if (!rows.length) console.log("(none)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
