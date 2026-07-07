import { getAdminCredentials } from "@/lib/config/auth-env";
import { verifyAnyAdminPassword } from "@/lib/services/admins";

/** Admin PIN accepts the env bootstrap password or any active admin password. */
export async function verifyAdminPin(pin: string): Promise<boolean> {
  return verifyAnyAdminPassword(pin);
}

export async function assertAdminPin(pin: string | undefined): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
      requiresPin: true;
    }
> {
  if (!pin?.trim()) {
    return {
      ok: false,
      error: "Admin PIN required — use your admin password.",
      requiresPin: true,
    };
  }
  if (!(await verifyAdminPin(pin))) {
    return {
      ok: false,
      error: "Incorrect admin PIN.",
      requiresPin: true,
    };
  }
  return { ok: true };
}

/** Legacy sync check for env bootstrap password only. */
export function verifyEnvAdminPin(pin: string): boolean {
  return pin.trim() === getAdminCredentials().password;
}
