import type { EmployeeRole } from "@/lib/constants";

import { getAuthSecret } from "@/lib/config/auth-env";

const SESSION_COOKIE = "agimi_session";
const SESSION_DAYS = 14;
const SECRET = getAuthSecret();

export type SessionUser =
  | {
      role: "admin";
      adminId: number;
      name: string;
      username: string;
      title?: string | null;
    }
  | {
      role: "employee";
      employeeId: number;
      name: string;
      roles: EmployeeRole[];
    };

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(data: string): string {
  const padded = data + "=".repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(
    padded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
}

async function hmacSign(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return encodeBase64Url(
    String.fromCharCode(...new Uint8Array(sig))
  );
}

async function hmacVerify(message: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = Uint8Array.from(decodeBase64Url(signature), (c) =>
    c.charCodeAt(0)
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(message)
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const sig = await hmacSign(body);
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionUser | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const valid = await hmacVerify(body, sig);
  if (!valid) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(body)) as SessionUser & {
      exp?: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (parsed.role === "admin") {
      return {
        role: "admin",
        adminId: typeof parsed.adminId === "number" ? parsed.adminId : 0,
        name: parsed.name || "Admin",
        username: typeof parsed.username === "string" ? parsed.username : "",
        title:
          typeof parsed.title === "string" || parsed.title === null
            ? parsed.title
            : null,
      };
    }
    if (
      parsed.role === "employee" &&
      typeof parsed.employeeId === "number" &&
      Array.isArray(parsed.roles)
    ) {
      return {
        role: "employee",
        employeeId: parsed.employeeId,
        name: parsed.name,
        roles: parsed.roles,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 86400) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export { SESSION_COOKIE };
