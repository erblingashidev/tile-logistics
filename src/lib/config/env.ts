import path from "path";
import { getAdminCredentials, getAuthSecret } from "@/lib/config/auth-env";

export { getAdminCredentials, getAuthSecret } from "@/lib/config/auth-env";

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH?.trim()) {
    return path.resolve(process.env.DATABASE_PATH.trim());
  }
  return path.join(process.cwd(), "data", "tile-logistics.db");
}

export function getUploadRoot(): string {
  if (process.env.UPLOAD_ROOT?.trim()) {
    return path.resolve(process.env.UPLOAD_ROOT.trim());
  }
  return path.join(process.cwd(), "data", "uploads");
}

export function isProductionDeploy(): boolean {
  return process.env.NODE_ENV === "production";
}

/** True when running on Netlify (serverless — no persistent local disk). */
export function isNetlify(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_DEV);
}

export function assertProductionSecrets(): void {
  if (!isProductionDeploy()) return;

  if (getAuthSecret() === "agimi-dev-secret-change-in-production") {
    console.warn(
      "[config] AUTH_SECRET is still the dev default — set a strong value in Netlify env vars."
    );
  }

  const { password } = getAdminCredentials();
  if (password === "admin") {
    console.warn(
      "[config] ADMIN_PASSWORD is still the default — change it in Netlify env vars."
    );
  }

  if (isNetlify() && !process.env.TURSO_DATABASE_URL) {
    console.warn(
      "[config] Netlify detected without TURSO_DATABASE_URL — SQLite file data will NOT persist between deploys. See docs/DEPLOY-NETLIFY.md."
    );
  }
}

export function getTursoConfig(): { url: string; authToken: string } | null {
  if (process.env.USE_LOCAL_DATABASE === "true") {
    return null;
  }
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url) return null;
  if (!authToken) {
    throw new Error("TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing.");
  }
  return { url, authToken };
}
