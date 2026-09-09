/**
 * Reset an admin password (and linked employee login if present).
 *
 *   npm run reset-admin-password -- erblingashi 'YourNewPassword'
 *   npm run reset-admin-password:turso -- erblingashi 'YourNewPassword'
 */
import { eq } from "drizzle-orm";
import { configureScriptDatabase, describeScriptDatabaseTarget } from "./db-target";
import { hashPassword } from "../src/lib/auth/password";
import { getDb } from "../src/lib/db";
import { dbOne } from "../src/lib/db/query";
import { admins, employees } from "../src/lib/db/schema";
import { MIN_ADMIN_PASSWORD_LENGTH } from "../src/lib/services/admins";
import { PLATFORM_OWNER_USERNAME } from "../src/lib/auth/platform-admin";

configureScriptDatabase();

async function main() {
  const username = (process.argv[2] ?? PLATFORM_OWNER_USERNAME).trim().toLowerCase();
  const password = process.argv[3] ?? "";

  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    console.error(
      `Usage: npm run reset-admin-password -- <username> <new-password>\nPassword must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`
    );
    process.exit(1);
  }

  const db = await getDb();
  const row = await dbOne(
    db
      .select()
      .from(admins)
      .where(eq(admins.username, username))
  );

  if (!row) {
    console.error(`No admin found with username "${username}" on ${describeScriptDatabaseTarget()}.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  await db
    .update(admins)
    .set({
      passwordHash,
      isActive: 1,
      isPlatformAdmin: username === PLATFORM_OWNER_USERNAME ? 1 : row.isPlatformAdmin,
      organizationId:
        username === PLATFORM_OWNER_USERNAME ? null : row.organizationId,
      updatedAt: now,
    })
    .where(eq(admins.id, row.id));

  if (row.employeeId) {
    await db
      .update(employees)
      .set({ passwordHash, updatedAt: now })
      .where(eq(employees.id, row.employeeId));
  }

  console.log(`Password reset for @${username} on ${describeScriptDatabaseTarget()}.`);
  console.log("You can log in at /login with the new password.");
  if (username === PLATFORM_OWNER_USERNAME) {
    console.log("Platform owner → choose a company after login.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
