import fs from "fs";
import path from "path";

const ENV_LOCAL = () => path.join(process.cwd(), ".env.local");

/** Load `.env.local` into process.env (does not override existing vars). */
export function loadEnvLocal() {
  const envPath = ENV_LOCAL();
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

/** True when `.env.local` defines Turso (same DB the dev server uses). */
export function envLocalHasTurso(): boolean {
  const envPath = ENV_LOCAL();
  if (!fs.existsSync(envPath)) return false;
  return /^TURSO_DATABASE_URL\s*=/m.test(fs.readFileSync(envPath, "utf8"));
}

export function stripTursoEnv() {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
}
