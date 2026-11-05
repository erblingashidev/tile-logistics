import {
  DEFAULT_ADMINISTRATION_SETTINGS,
  type AdministrationSettings,
} from "@/lib/administration/administration-settings-shared";
import { getOrgSettingValue, setOrganizationSetting } from "@/lib/services/organizations";

export const ADMINISTRATION_SETTINGS_KEY = "administration_settings";
export type { AdministrationSettings };
export { DEFAULT_ADMINISTRATION_SETTINGS };

export function parseAdministrationSettings(
  raw: string | null | undefined
): AdministrationSettings {
  if (!raw?.trim()) return { ...DEFAULT_ADMINISTRATION_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<AdministrationSettings>;
    return {
      cashRegisterEnabled: parsed.cashRegisterEnabled === true,
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
    cashRegisterEnabled:
      patch.cashRegisterEnabled !== undefined
        ? patch.cashRegisterEnabled === true
        : current.cashRegisterEnabled,
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

export async function assertCashRegisterEnabled(organizationId: number) {
  const settings = await getAdministrationSettings(organizationId);
  if (!settings.cashRegisterEnabled) {
    throw new Error(
      "Cash register is disabled. Record payments via Finance → Excel import and To assign."
    );
  }
}
