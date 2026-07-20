import fs from "fs";
import path from "path";
import { getDatabasePath, getTursoConfig } from "../src/lib/config/env";
import { loadEnvLocal, stripTursoEnv } from "./load-env-local";

/** Same rules as the Next.js app (`getTursoConfig` + `createDbClient`). */
export function configureScriptDatabase() {
  loadEnvLocal();

  const forceTurso = process.env.DB_TARGET === "turso";
  const forceLocal =
    process.env.DB_TARGET === "local" ||
    process.env.SEED_TARGET === "local" ||
    (process.env.USE_LOCAL_DATABASE === "true" && !forceTurso);

  if (forceTurso) {
    // .env.local often has USE_LOCAL_DATABASE=true for local dev — clear it
    // so getTursoConfig() actually connects to Turso.
    delete process.env.USE_LOCAL_DATABASE;
  } else if (forceLocal) {
    stripTursoEnv();
  }
}

export function describeScriptDatabaseTarget(): string {
  const turso = getTursoConfig();
  if (turso) {
    const host = turso.url.replace(/^libsql:\/\//, "").split("/")[0];
    return `Turso (${host})`;
  }
  return `local SQLite (${getDatabasePath()})`;
}

export function envLocalUsesTurso(): boolean {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, "utf8");
  const hasTurso = /^TURSO_DATABASE_URL\s*=/m.test(content);
  const useLocal = /^USE_LOCAL_DATABASE\s*=\s*true\s*$/m.test(content);
  return hasTurso && !useLocal;
}

export function printDatabaseMismatchHint() {
  if (process.env.SEED_TARGET === "local") {
    console.warn(
      "\n⚠️  SEED_TARGET=local — seeded SQLite only. Add USE_LOCAL_DATABASE=true to .env.local"
    );
    console.warn("    (or comment out TURSO_*) so npm run dev reads the same file.\n");
    return;
  }
  if (envLocalUsesTurso()) {
    console.warn(
      "\nℹ️  .env.local has Turso without USE_LOCAL_DATABASE=true."
    );
    console.warn("    npm run dev uses Turso — npm run seed:local does NOT.\n");
  }
}
