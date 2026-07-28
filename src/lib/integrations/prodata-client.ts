/**
 * Pro-Data REST API HTTP client (JWT Bearer auth).
 */
import { getProDataApiConfig, type ProDataApiConfig } from "@/lib/config/prodata-env";

export interface ProDataLoginResponse {
  token?: string;
  message?: string;
  user?: {
    hasError?: boolean;
    errorMsg?: string;
    success?: boolean;
    fullName?: string;
    username?: string;
  };
}

let cachedToken: { value: string; fetchedAt: number } | null = null;
const TOKEN_MAX_AGE_MS = 55 * 60 * 1000;

function apiPath(config: ProDataApiConfig, segment: string): string {
  const base = config.baseUrl.replace(/\/$/, "");
  const path = segment.startsWith("/") ? segment : `/${segment}`;
  if (base.endsWith("/RestAPI")) {
    return `${base}${path}`;
  }
  return `${base}/RestAPI${path}`;
}

export async function proDataLogin(
  config: ProDataApiConfig = getProDataApiConfig()!
): Promise<string> {
  const url = new URL(apiPath(config, "/ProDataRestAPI/B2BLoginAdmin"));
  url.searchParams.set("username", config.username);
  url.searchParams.set("password", config.password);

  const res = await fetch(url, { method: "POST" });
  const text = await res.text();
  let data: ProDataLoginResponse;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Pro-Data login returned invalid JSON (HTTP ${res.status}).`);
  }

  if (!res.ok || !data.token) {
    const msg =
      data.user?.errorMsg ||
      data.message ||
      `Pro-Data login failed (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  cachedToken = { value: data.token, fetchedAt: Date.now() };
  return data.token;
}

async function getToken(config: ProDataApiConfig): Promise<string> {
  if (
    cachedToken &&
    Date.now() - cachedToken.fetchedAt < TOKEN_MAX_AGE_MS
  ) {
    return cachedToken.value;
  }
  return proDataLogin(config);
}

export function clearProDataTokenCache() {
  cachedToken = null;
}

export interface ProDataFetchOptions {
  config?: ProDataApiConfig;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  params?: Record<string, string | number | boolean | undefined>;
  retryOn401?: boolean;
}

export async function proDataFetch<T = unknown>(
  path: string,
  options: ProDataFetchOptions = {}
): Promise<T> {
  const config = options.config ?? getProDataApiConfig();
  if (!config) {
    throw new Error("Pro-Data API is not configured.");
  }

  const token = await getToken(config);
  const url = new URL(apiPath(config, path));
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 && options.retryOn401 !== false) {
    clearProDataTokenCache();
    const fresh = await getToken(config);
    const retry = await fetch(url, {
      method: options.method ?? "GET",
      headers: { Authorization: `Bearer ${fresh}` },
    });
    return parseProDataResponse<T>(retry);
  }

  return parseProDataResponse<T>(res);
}

async function parseProDataResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      throw new Error(`Pro-Data API error (HTTP ${res.status}).`);
    }
    return [] as T;
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Pro-Data API returned invalid JSON (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" &&
      data &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : `Pro-Data API error (HTTP ${res.status}).`;
    throw new Error(msg);
  }

  if (
    typeof data === "object" &&
    data &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string" &&
    /access denied|error/i.test((data as { message: string }).message)
  ) {
    throw new Error((data as { message: string }).message);
  }

  return data as T;
}

export async function proDataFetchAllPages<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  options?: { rowsPerPage?: number; config?: ProDataApiConfig }
): Promise<T[]> {
  const rowsPerPage = options?.rowsPerPage ?? 100;
  const all: T[] = [];
  let pageNumber = 1;

  for (;;) {
    const page = await proDataFetch<T[]>(path, {
      config: options?.config,
      params: { ...params, rowsPerPage, pageNumber },
    });
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < rowsPerPage) break;
    pageNumber += 1;
  }

  return all;
}
