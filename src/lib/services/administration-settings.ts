import { getOrgSettingValue, setOrganizationSetting } from "@/lib/services/organizations";

export const ADMINISTRATION_SETTINGS_KEY = "administration_settings";

export type AdministrationSettings = {
  /** When true, cash register requires invoice/receipt on every line plus customer + agent on payments/refunds. */
  registerStrictTraceability: boolean;
};

export const DEFAULT_ADMINISTRATION_SETTINGS: AdministrationSettings = {
  registerStrictTraceability: false,
};

export function parseAdministrationSettings(
  raw: string | null | undefined
): AdministrationSettings {
  if (!raw?.trim()) return { ...DEFAULT_ADMINISTRATION_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<AdministrationSettings>;
    return {
      registerStrictTraceability:
        parsed.registerStrictTraceability === true,
    };
  } catch {
    return { ...DEFAULT_ADMINISTRATION_SETTINGS };
  }
}

export async function getAdministrationSettings(
  organizationId: number
): Promise<AdministrationSettings> {
  const raw = await getOrgSettingValue(
    organizationId,
    ADMINISTRATION_SETTINGS_KEY
  );
  return parseAdministrationSettings(raw);
}

export async function updateAdministrationSettings(
  organizationId: number,
  patch: Partial<AdministrationSettings>
): Promise<AdministrationSettings> {
  const current = await getAdministrationSettings(organizationId);
  const next: AdministrationSettings = {
    registerStrictTraceability:
      patch.registerStrictTraceability !== undefined
        ? patch.registerStrictTraceability === true
        : current.registerStrictTraceability,
  };
  await setOrganizationSetting(
    organizationId,
    ADMINISTRATION_SETTINGS_KEY,
    JSON.stringify(next)
  );
  return next;
}
