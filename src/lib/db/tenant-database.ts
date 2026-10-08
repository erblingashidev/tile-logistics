import fs from "fs";
import path from "path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTursoConfig, isNetlify } from "@/lib/config/env";
import * as schema from "@/lib/db/schema";
import { LEGACY_AGIMI_ORGANIZATION_ID } from "@/lib/organizations/constants";
import { setOrganizationSetting } from "@/lib/services/organizations";

export const TENANT_DATABASE_URL_KEY = "tenant_database_url";
export const TENANT_DATABASE_TOKEN_KEY = "tenant_database_auth_token";
export const TENANT_DATABASE_ISOLATED_KEY = "tenant_database_isolated";

const tenantDbCache = new Map<number, Promise<ReturnType<typeof drizzle<typeof schema>>>>();

function tenantDatabasePath(orgId: number, slug: string): string {
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const dir = path.join(process.cwd(), "data", "tenants");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `org-${orgId}-${safeSlug}.db`);
}

async function readOrgSetting(orgId: number, key: string): Promise<string | null> {
  const { getOrgSettingValue } = await import("@/lib/services/organizations");
  return getOrgSettingValue(orgId, key);
}

export async function getOrganizationDatabaseConfig(orgId: number): Promise<{
  url: string;
  authToken?: string;
  isolated: boolean;
} | null> {
  const url = await readOrgSetting(orgId, TENANT_DATABASE_URL_KEY);
  if (!url?.trim()) return null;
  const token = await readOrgSetting(orgId, TENANT_DATABASE_TOKEN_KEY);
  const isolated =
    (await readOrgSetting(orgId, TENANT_DATABASE_ISOLATED_KEY)) === "true";
  return {
    url: url.trim(),
    authToken: token?.trim() || undefined,
    isolated,
  };
}

export async function isOrganizationDatabaseIsolated(orgId: number): Promise<boolean> {
  const config = await getOrganizationDatabaseConfig(orgId);
  return Boolean(config?.isolated && config.url);
}

async function setOrgSetting(orgId: number, key: string, value: string) {
  await setOrganizationSetting(orgId, key, value);
}

function createTenantClient(url: string, authToken?: string): Client {
  if (url.startsWith("file:")) {
    const filePath = url.replace(/^file:/, "");
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (authToken) {
    return createClient({ url, authToken });
  }
  return createClient({ url });
}

async function openTenantDatabase(orgId: number): Promise<
  ReturnType<typeof drizzle<typeof schema>>
> {
  const config = await getOrganizationDatabaseConfig(orgId);
  if (!config?.url) {
    throw new Error(`No dedicated database configured for organization ${orgId}.`);
  }
  const client = createTenantClient(config.url, config.authToken);
  await client.execute("PRAGMA foreign_keys = ON");
  const { bootstrapOperationalDatabase } = await import("@/lib/db/index");
  await bootstrapOperationalDatabase(client);
  return drizzle(client, { schema });
}

/** Dedicated tenant DB when configured; otherwise null (use shared control-plane DB). */
export async function getDedicatedTenantDbIfConfigured(orgId: number) {
  if (!(await isOrganizationDatabaseIsolated(orgId))) return null;
  let pending = tenantDbCache.get(orgId);
  if (!pending) {
    pending = openTenantDatabase(orgId);
    tenantDbCache.set(orgId, pending);
  }
  return pending;
}

/**
 * Create an isolated SQLite database for a company (local / dev).
 * On Netlify+Turso without per-tenant URLs, companies stay on shared DB with row-level isolation.
 */
export async function provisionOrganizationDatabase(
  orgId: number,
  slug: string
): Promise<{ mode: "dedicated" | "shared"; url?: string }> {
  if (orgId === LEGACY_AGIMI_ORGANIZATION_ID) {
    return { mode: "shared" };
  }

  const existing = await getOrganizationDatabaseConfig(orgId);
  if (existing?.isolated) {
    return { mode: "dedicated", url: existing.url };
  }

  const turso = getTursoConfig();
  if (turso && isNetlify()) {
    // Shared Turso cluster: logical isolation until a dedicated Turso DB URL is registered.
    await setOrgSetting(orgId, TENANT_DATABASE_ISOLATED_KEY, "false");
    return { mode: "shared" };
  }

  const filePath = tenantDatabasePath(orgId, slug);
  const url = `file:${filePath}`;
  const client = createTenantClient(url);
  await client.execute("PRAGMA foreign_keys = ON");
  const { bootstrapOperationalDatabase } = await import("@/lib/db/index");
  await bootstrapOperationalDatabase(client);

  const now = new Date().toISOString();
  await setOrgSetting(orgId, TENANT_DATABASE_URL_KEY, url);
  await setOrgSetting(orgId, TENANT_DATABASE_ISOLATED_KEY, "true");
  await setOrgSetting(orgId, TENANT_DATABASE_TOKEN_KEY, "");
  await setOrgSetting(
    orgId,
    "tenant_database_provisioned_at",
    now
  );

  tenantDbCache.delete(orgId);
  return { mode: "dedicated", url };
}

/** Platform admin: attach an external Turso database to a company. */
export async function registerOrganizationDatabase(input: {
  organizationId: number;
  url: string;
  authToken: string;
}) {
  const url = input.url.trim();
  const authToken = input.authToken.trim();
  if (!url || !authToken) {
    throw new Error("Database URL and auth token are required.");
  }
  const client = createTenantClient(url, authToken);
  await client.execute("PRAGMA foreign_keys = ON");
  const { bootstrapOperationalDatabase } = await import("@/lib/db/index");
  await bootstrapOperationalDatabase(client);
  await setOrgSetting(input.organizationId, TENANT_DATABASE_URL_KEY, url);
  await setOrgSetting(input.organizationId, TENANT_DATABASE_TOKEN_KEY, authToken);
  await setOrgSetting(input.organizationId, TENANT_DATABASE_ISOLATED_KEY, "true");
  tenantDbCache.delete(input.organizationId);
}
