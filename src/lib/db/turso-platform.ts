import { getTursoPlatformConfig } from "@/lib/config/env";

const TURSO_API_BASE = "https://api.turso.tech";

type TursoDatabaseRecord = {
  Name?: string;
  Hostname?: string;
  name?: string;
  hostname?: string;
};

function databaseHostname(record: TursoDatabaseRecord): string {
  const host = record.Hostname ?? record.hostname;
  if (!host?.trim()) {
    throw new Error("Turso API did not return a database hostname.");
  }
  return host.trim();
}

function databaseName(record: TursoDatabaseRecord): string {
  const name = record.Name ?? record.name;
  if (!name?.trim()) {
    throw new Error("Turso API did not return a database name.");
  }
  return name.trim();
}

async function tursoPlatformFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const config = getTursoPlatformConfig();
  if (!config) {
    throw new Error(
      "Turso Platform API is not configured (TURSO_PLATFORM_TOKEN + TURSO_ORGANIZATION)."
    );
  }
  const res = await fetch(`${TURSO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Turso API ${res.status} ${path}: ${text || res.statusText}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function buildTursoTenantDatabaseName(
  orgId: number,
  slug: string
): string {
  const config = getTursoPlatformConfig();
  const prefix = config?.dbNamePrefix ?? "logistics-core-";
  const safeSlug = slug
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  let name = `${prefix}${safeSlug || `org-${orgId}`}`;
  if (name.length > 64) {
    name = `${prefix}${orgId}-${safeSlug}`.slice(0, 64).replace(/-+$/g, "");
  }
  return name;
}

async function getTursoDatabase(
  dbName: string
): Promise<TursoDatabaseRecord | null> {
  const config = getTursoPlatformConfig();
  if (!config) return null;
  try {
    const data = await tursoPlatformFetch<{ database: TursoDatabaseRecord }>(
      `/v1/organizations/${encodeURIComponent(config.organization)}/databases/${encodeURIComponent(dbName)}`
    );
    return data.database ?? null;
  } catch {
    return null;
  }
}

async function createTursoDatabase(dbName: string): Promise<TursoDatabaseRecord> {
  const config = getTursoPlatformConfig();
  if (!config) {
    throw new Error("Turso Platform API is not configured.");
  }
  try {
    const data = await tursoPlatformFetch<{ database: TursoDatabaseRecord }>(
      `/v1/organizations/${encodeURIComponent(config.organization)}/databases`,
      {
        method: "POST",
        body: JSON.stringify({ name: dbName, group: config.group }),
      }
    );
    if (!data.database) {
      throw new Error("Turso create database returned an empty response.");
    }
    return data.database;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("409") && !message.toLowerCase().includes("already")) {
      throw err;
    }
    const existing = await getTursoDatabase(dbName);
    if (existing) return existing;
    throw err;
  }
}

export async function mintTursoDatabaseAuthToken(
  dbName: string
): Promise<string> {
  const config = getTursoPlatformConfig();
  if (!config) {
    throw new Error("Turso Platform API is not configured.");
  }
  const data = await tursoPlatformFetch<{ jwt: string }>(
    `/v1/organizations/${encodeURIComponent(config.organization)}/databases/${encodeURIComponent(dbName)}/auth/tokens?authorization=full-access&expiration=never`,
    { method: "POST", body: "{}" }
  );
  if (!data.jwt?.trim()) {
    throw new Error("Turso did not return a database auth token.");
  }
  return data.jwt.trim();
}

/** Create (or reuse) a Turso libSQL database for one company. */
export async function provisionTursoTenantDatabase(
  orgId: number,
  slug: string
): Promise<{ url: string; dbName: string; authToken: string }> {
  const dbName = buildTursoTenantDatabaseName(orgId, slug);
  const record = await createTursoDatabase(dbName);
  const hostname = databaseHostname(record);
  const name = databaseName(record);
  const authToken = await mintTursoDatabaseAuthToken(name);
  return {
    url: `libsql://${hostname}`,
    dbName: name,
    authToken,
  };
}
