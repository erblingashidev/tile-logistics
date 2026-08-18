export const FEATURE_FLAG_IDS = [
  "manualDispatchMode",
  "deliveryRounds",
  "smartDispatch",
  "warehouseWms",
] as const;

export type FeatureFlagId = (typeof FEATURE_FLAG_IDS)[number];

export type FeatureFlags = Record<FeatureFlagId, boolean>;

export const FEATURE_FLAG_DEFAULTS: FeatureFlags = {
  manualDispatchMode: true,
  deliveryRounds: false,
  smartDispatch: true,
  warehouseWms: false,
};

export const FEATURE_FLAG_SETTING_KEYS: Record<FeatureFlagId, string> = {
  manualDispatchMode: "manual_dispatch_mode",
  deliveryRounds: "delivery_rounds",
  smartDispatch: "smart_dispatch",
  warehouseWms: "wms_enabled",
};

export type FeatureFlagGroup = "Operations" | "Dispatch" | "Warehouse";

export const FEATURE_FLAG_META: Array<{
  id: FeatureFlagId;
  group: FeatureFlagGroup;
  title: string;
  description: string;
  enabledLabel: string;
  disabledLabel: string;
}> = [
  {
    id: "manualDispatchMode",
    group: "Operations",
    title: "Manual dispatch mode",
    description:
      "Admins assign trucks and update order status on the Orders page. Employee portal steps (prepared, loaded, departed, delivered) stay paused.",
    enabledLabel: "Office-led workflow",
    disabledLabel: "Employee portal active",
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
