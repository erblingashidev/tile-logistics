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

export async function getFeatureFlags(): Promise<FeatureFlags> {
  return effectiveFeatureFlags(await getStoredFeatureFlags());
}

export async function updateFeatureFlags(
  patch: Partial<FeatureFlags>
): Promise<FeatureFlags> {
  const current = await getStoredFeatureFlags();
  const applied = expandFeatureFlagPatch(current, patch);
  const next = { ...current };
  for (const id of FEATURE_FLAG_IDS) {
    if (typeof applied[id] !== "boolean" || applied[id] === current[id]) continue;
    next[id] = applied[id]!;
    await setAppSetting(
      FEATURE_FLAG_SETTING_KEYS[id],
      applied[id] ? "true" : "false"
    );
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
        details: { previous: current, next },
      }
    );
  }

  return next;
}

export async function updateFeatureFlagsFromBody(
  body: unknown
): Promise<FeatureFlags> {
  return updateFeatureFlags(parseFeatureFlagPatch(body));
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
