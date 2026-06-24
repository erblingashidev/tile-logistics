import { getAdminCredentials } from "@/lib/config/auth-env";

/** Admin PIN uses the same secret as admin login. */
export function verifyAdminPin(pin: string): boolean {
  return pin.trim() === getAdminCredentials().password;
}

export function assertAdminPin(pin: string | undefined): {
  ok: true;
} | {
  ok: false;
  error: string;
  requiresPin: true;
} {
  if (!pin?.trim()) {
    return {
      ok: false,
      error: "Admin PIN required — use your admin password.",
      requiresPin: true,
    };
  }
  if (!verifyAdminPin(pin)) {
    return {
      ok: false,
      error: "Incorrect admin PIN.",
      requiresPin: true,
    };
  }
  return { ok: true };
}
