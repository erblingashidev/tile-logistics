export const FEATURE_FLAG_IDS = [
  "operationsSuite",
  "manualDispatchMode",
  "truckFocus",
  "deliveryRounds",
  "smartDispatch",
  "warehouseWms",
] as const;

export type FeatureFlagId = (typeof FEATURE_FLAG_IDS)[number];

export type FeatureFlags = Record<FeatureFlagId, boolean>;

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  operationsSuite: false,
  manualDispatchMode: true,
  truckFocus: false,
  deliveryRounds: false,
  smartDispatch: false,
  warehouseWms: false,
};

export const FEATURE_FLAG_SETTING_KEYS: Record<FeatureFlagId, string> = {
  operationsSuite: "operations_suite",
  manualDispatchMode: "manual_dispatch_mode",
  truckFocus: "truck_focus",
  deliveryRounds: "delivery_rounds",
  smartDispatch: "smart_dispatch",
  warehouseWms: "wms_enabled",
};

/** Applied when switching from Records to Logistics so one toggle turns the system on. */
export const LOGISTICS_PRESET: Partial<FeatureFlags> = {
  operationsSuite: true,
  manualDispatchMode: false,
  truckFocus: true,
  smartDispatch: true,
  warehouseWms: true,
};

export type FeatureFlagGroup = "Operations" | "Dispatch" | "Warehouse";

export const FEATURE_FLAG_META: Array<{
  id: FeatureFlagId;
  group: FeatureFlagGroup;
  title: string;
  description: string;
  enabledLabel: string;
  disabledLabel: string;
  /** UI switch is on when the stored flag is false (e.g. employee portal vs office-only). */
  invert?: boolean;
}> = [
  {
    id: "manualDispatchMode",
    group: "Operations",
    title: "Employee delivery portal",
    description:
      "Loaders and drivers mark orders prepared, loaded, departed, and delivered. Turn off to keep status updates in the office only.",
    enabledLabel: "Portal active",
    disabledLabel: "Office updates only",
    invert: true,
  },
  {
    id: "truckFocus",
    group: "Operations",
    title: "Truck focus on Orders",
    description:
      "Work one truck’s load from the Orders page when assigning deliveries for the day.",
    enabledLabel: "Truck workspace visible",
    disabledLabel: "Hidden",
  },
  {
    id: "deliveryRounds",
    group: "Dispatch",
    title: "Multiple trips per truck",
    description:
      "When a truck returns to the warehouse, assign a second (or later) trip the same day. Leave this off if each truck makes one run.",
    enabledLabel: "Rounds 1–5 visible",
    disabledLabel: "Single trip per truck",
  },
  {
    id: "smartDispatch",
    group: "Dispatch",
    title: "Smart dispatch",
    description:
      "Recommend trucks from capacity, region, and route distance. Turn off to assign only by hand.",
    enabledLabel: "Recommendations on",
    disabledLabel: "Manual assign only",
  },
  {
    id: "warehouseWms",
    group: "Warehouse",
    title: "Warehouse (WMS)",
    description:
      "Outdoor warehouse tools: unloading, row mapping, stock levels, and inventory counts for admin and depot staff.",
    enabledLabel: "Warehouse module on",
    disabledLabel: "Hidden",
  },
];

export const FEATURE_RECOMMENDATIONS = [
  {
    title: "Customer SMS on departure",
    description:
      "Text the customer when the truck leaves the warehouse, with invoice number and a rough arrival window.",
  },
  {
    title: "Live driver location",
    description:
      "Show the truck on the dispatch map while it is on the road, so the office can answer “where is my order?” without calling.",
  },
  {
    title: "Cutoff-time dispatch sheet",
    description:
      "Auto-prepare the print sheet at a set time each morning so loaders start from one agreed list.",
  },
] as const;

export function parseFeatureFlags(
  input: Partial<Record<FeatureFlagId, unknown>> | null | undefined
): FeatureFlags {
  const next = { ...FEATURE_FLAG_DEFAULTS };
  for (const id of FEATURE_FLAG_IDS) {
    if (typeof input?.[id] === "boolean") {
      next[id] = input[id];
    }
  }
  return next;
}

export function parseFeatureFlagPatch(
  body: unknown
): Partial<FeatureFlags> {
  if (!body || typeof body !== "object") return {};
  const patch: Partial<FeatureFlags> = {};
  for (const id of FEATURE_FLAG_IDS) {
    const value = (body as Record<string, unknown>)[id];
    if (typeof value === "boolean") patch[id] = value;
  }
  return patch;
}

/** Runtime flags: Records mode pauses dispatch, WMS, and the employee portal. */
export function effectiveFeatureFlags(stored: FeatureFlags): FeatureFlags {
  if (stored.operationsSuite) return stored;
  return {
    ...stored,
    operationsSuite: false,
    manualDispatchMode: true,
    truckFocus: false,
    deliveryRounds: false,
    smartDispatch: false,
    warehouseWms: false,
  };
}

export function expandFeatureFlagPatch(
  current: FeatureFlags,
  patch: Partial<FeatureFlags>
): Partial<FeatureFlags> {
  if (patch.operationsSuite === true && !current.operationsSuite) {
    return { ...LOGISTICS_PRESET, ...patch };
  }
  return patch;
}

export function moduleSwitchChecked(
  flags: FeatureFlags,
  id: FeatureFlagId
): boolean {
  const meta = FEATURE_FLAG_META.find((item) => item.id === id);
  const value = flags[id];
  return meta?.invert ? !value : value;
}

export function moduleSwitchToFlagValue(
  id: FeatureFlagId,
  checked: boolean
): boolean {
  const meta = FEATURE_FLAG_META.find((item) => item.id === id);
  return meta?.invert ? !checked : checked;
}
