import {
  FEATURE_FLAG_DEFAULTS,
  FEATURE_FLAG_IDS,
  FEATURE_FLAG_SETTING_KEYS,
  effectiveFeatureFlags,
  expandFeatureFlagPatch,
  parseFeatureFlagPatch,
  type FeatureFlagId,
  type FeatureFlags,
} from "@/lib/features/catalog";
import { getAppSetting, setAppSetting } from "@/lib/services/app-settings";
import { logActivity } from "@/lib/logger";
import {
  DEFAULT_ORGANIZATION_ID,
  getFeatureFlagsForOrganization,
  LEGACY_AGIMI_ORGANIZATION_ID,
  setOrganizationSetting,
} from "@/lib/services/organizations";
import type { SessionUser } from "@/lib/auth/session";

export const MANUAL_DISPATCH_MODE_KEY =
  FEATURE_FLAG_SETTING_KEYS.manualDispatchMode;

function parseStoredFlag(value: string | null, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function getStoredFeatureFlags(): Promise<FeatureFlags> {
  const flags = { ...FEATURE_FLAG_DEFAULTS };
  const storedValues = await Promise.all(
    FEATURE_FLAG_IDS.map(async (id) => {
      const stored = await getAppSetting(FEATURE_FLAG_SETTING_KEYS[id]);
      flags[id] = parseStoredFlag(stored, FEATURE_FLAG_DEFAULTS[id]);
      return [id, stored] as const;
    })
  );
  const suiteUnset = storedValues.some(
    ([id, stored]) => id === "operationsSuite" && stored == null
  );
  if (suiteUnset) {
    flags.operationsSuite =
      flags.warehouseWms ||
      flags.truckFocus ||
      flags.deliveryRounds ||
      !flags.manualDispatchMode;
  }
  return flags;
}

export async function getFeatureFlags(
  organizationId?: number | null
): Promise<FeatureFlags> {
  if (organizationId != null && organizationId > 0) {
    return effectiveFeatureFlags(
      await getFeatureFlagsForOrganization(organizationId)
    );
  }
  return effectiveFeatureFlags(await getStoredFeatureFlags());
}

export async function getFeatureFlagsForSession(
  session: SessionUser | null
): Promise<FeatureFlags> {
  if (session?.role === "admin") {
    const orgId = session.organizationId ?? DEFAULT_ORGANIZATION_ID;
    if (orgId > 0) return getFeatureFlags(orgId);
  }
  return getFeatureFlags();
}

export async function updateFeatureFlags(
  patch: Partial<FeatureFlags>,
  organizationId?: number | null
): Promise<FeatureFlags> {
  const orgId =
    organizationId != null && organizationId > 0 ? organizationId : null;
  const current = orgId
    ? await getFeatureFlags(orgId)
    : await getStoredFeatureFlags();
  const applied = expandFeatureFlagPatch(current, patch);
  const next = { ...current };
  for (const id of FEATURE_FLAG_IDS) {
    if (typeof applied[id] !== "boolean" || applied[id] === current[id]) continue;
    next[id] = applied[id]!;
    const stored = applied[id] ? "true" : "false";
    const key = FEATURE_FLAG_SETTING_KEYS[id];
    if (orgId) {
      await setOrganizationSetting(orgId, key, stored);
      if (orgId === LEGACY_AGIMI_ORGANIZATION_ID) {
        await setAppSetting(key, stored);
      }
    } else {
      await setAppSetting(key, stored);
    }
  }

  const changed = FEATURE_FLAG_IDS.filter((id) => current[id] !== next[id]);
  if (changed.length > 0) {
    await logActivity(
      "update",
      "settings",
      null,
      `Operations modules updated: ${changed
        .map((id) => `${id}=${next[id] ? "on" : "off"}`)
        .join(", ")}`,
      {
        category: "system",
        details: { previous: current, next, organizationId: orgId },
      }
    );
  }

  return next;
}

export async function updateFeatureFlagsFromBody(
  body: unknown,
  organizationId?: number | null
): Promise<FeatureFlags> {
  return updateFeatureFlags(parseFeatureFlagPatch(body), organizationId);
}

export async function updateFeatureFlagsForSession(
  session: SessionUser | null,
  body: unknown
): Promise<FeatureFlags> {
  const orgId =
    session?.role === "admin"
      ? session.organizationId ?? DEFAULT_ORGANIZATION_ID
      : null;
  return updateFeatureFlagsFromBody(body, orgId);
}

export async function isManualDispatchMode(): Promise<boolean> {
  return (await getFeatureFlags()).manualDispatchMode;
}

export async function setManualDispatchMode(enabled: boolean): Promise<void> {
  await updateFeatureFlags({ manualDispatchMode: enabled });
}

export async function isDeliveryRoundsEnabled(): Promise<boolean> {
  return (await getFeatureFlags()).deliveryRounds;
}

export async function isSmartDispatchEnabled(): Promise<boolean> {
  return (await getFeatureFlags()).smartDispatch;
}

export async function isWarehouseWmsEnabled(): Promise<boolean> {
  return (await getFeatureFlags()).warehouseWms;
}

export async function assertEmployeeWorkflowEnabled(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (await isManualDispatchMode()) {
    return {
      ok: false,
      error:
        "Employee delivery workflow is paused. Use admin orders to update status manually.",
    };
  }
  return { ok: true };
}

export async function assertWarehouseWmsEnabled(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!(await isWarehouseWmsEnabled())) {
    return {
      ok: false,
      error: "Warehouse module is turned off in Settings.",
    };
  }
  return { ok: true };
}

/** New assignments use round 1 while multiple trips are disabled. */
export async function resolveRequestedDeliveryRound(
  requested?: number
): Promise<number> {
  if (!(await isDeliveryRoundsEnabled())) return 1;
  const round = Number(requested);
  return Number.isFinite(round) && round >= 1 ? round : 1;
}

export type { FeatureFlagId, FeatureFlags };
