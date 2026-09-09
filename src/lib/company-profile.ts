import type { FeatureFlags } from "@/lib/features/catalog";

export const COMPANY_CATEGORIES = [
  { id: "tile_dealer", label: "Tile dealer", description: "Tiles, m², pallets, deliveries" },
  { id: "building_materials", label: "Building materials", description: "Mixed products, bags, weight" },
  { id: "wholesale", label: "Wholesale / distribution", description: "Pieces, boxes, simple logistics" },
  { id: "general", label: "General", description: "Configure everything yourself" },
] as const;

export type CompanyCategory = (typeof COMPANY_CATEGORIES)[number]["id"];

export const PRODUCT_FOCUS_OPTIONS = [
  { id: "tiles", label: "Tiles (area units)" },
  { id: "adhesive", label: "Adhesive / bags" },
  { id: "mixed", label: "Mixed catalog" },
  { id: "general", label: "General products" },
] as const;

export type ProductFocus = (typeof PRODUCT_FOCUS_OPTIONS)[number]["id"];

export type CompanyModuleFlags = {
  vehicles: boolean;
  dispatch: boolean;
  warehouse: boolean;
  returns: boolean;
  employeePortal: boolean;
  useInvoices: boolean;
};

export type OrganizationUnit = {
  id?: number;
  code: string;
  label: string;
  sortOrder?: number;
};

export type CompanyProfile = {
  companyCategory: CompanyCategory;
  productFocus: ProductFocus;
  modules: CompanyModuleFlags;
  onboardingComplete: boolean;
};

export const DEFAULT_COMPANY_MODULES: CompanyModuleFlags = {
  vehicles: false,
  dispatch: false,
  warehouse: false,
  returns: true,
  employeePortal: false,
  useInvoices: true,
};

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyCategory: "general",
  productFocus: "general",
  modules: { ...DEFAULT_COMPANY_MODULES },
  onboardingComplete: false,
};

export const CATEGORY_PRESETS: Record<
  CompanyCategory,
  Partial<CompanyProfile> & { suggestedUnits: OrganizationUnit[] }
> = {
  tile_dealer: {
    companyCategory: "tile_dealer",
    productFocus: "tiles",
    modules: {
      vehicles: true,
      dispatch: true,
      warehouse: true,
      returns: true,
      employeePortal: true,
      useInvoices: true,
    },
    suggestedUnits: [
      { code: "m2", label: "m²", sortOrder: 0 },
      { code: "piece", label: "pieces", sortOrder: 1 },
    ],
  },
  building_materials: {
    companyCategory: "building_materials",
    productFocus: "mixed",
    modules: {
      vehicles: true,
      dispatch: true,
      warehouse: false,
      returns: true,
      employeePortal: false,
      useInvoices: true,
    },
    suggestedUnits: [
      { code: "piece", label: "bags", sortOrder: 0 },
      { code: "kg", label: "kg", sortOrder: 1 },
      { code: "m2", label: "m²", sortOrder: 2 },
    ],
  },
  wholesale: {
    companyCategory: "wholesale",
    productFocus: "general",
    modules: {
      vehicles: false,
      dispatch: false,
      warehouse: false,
      returns: true,
      employeePortal: false,
      useInvoices: true,
    },
    suggestedUnits: [{ code: "piece", label: "pieces", sortOrder: 0 }],
  },
  general: {
    companyCategory: "general",
    productFocus: "general",
    modules: { ...DEFAULT_COMPANY_MODULES },
    suggestedUnits: [{ code: "piece", label: "pieces", sortOrder: 0 }],
  },
};

/** Pre-onboarding AGIMI tenant — always treated as fully set up. */
export function legacyAgimiCompanyProfile(): CompanyProfile {
  const preset = CATEGORY_PRESETS.tile_dealer;
  return {
    companyCategory: preset.companyCategory ?? "tile_dealer",
    productFocus: preset.productFocus ?? "tiles",
    modules: {
      vehicles: true,
      dispatch: true,
      warehouse: true,
      returns: true,
      employeePortal: true,
      useInvoices: true,
      ...preset.modules,
    },
    onboardingComplete: true,
  };
}

export function slugifyCompanyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function parseCompanyProfile(raw: unknown): CompanyProfile {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COMPANY_PROFILE };
  const o = raw as Record<string, unknown>;
  const modulesRaw =
    o.modules && typeof o.modules === "object"
      ? (o.modules as Record<string, unknown>)
      : {};
  return {
    companyCategory: isCompanyCategory(o.companyCategory)
      ? o.companyCategory
      : "general",
    productFocus: isProductFocus(o.productFocus) ? o.productFocus : "general",
    modules: {
      vehicles: modulesRaw.vehicles === true,
      dispatch: modulesRaw.dispatch === true,
      warehouse: modulesRaw.warehouse === true,
      returns: modulesRaw.returns !== false,
      employeePortal: modulesRaw.employeePortal === true,
      useInvoices: modulesRaw.useInvoices !== false,
    },
    onboardingComplete: o.onboardingComplete === true,
  };
}

function isCompanyCategory(v: unknown): v is CompanyCategory {
  return COMPANY_CATEGORIES.some((c) => c.id === v);
}

function isProductFocus(v: unknown): v is ProductFocus {
  return PRODUCT_FOCUS_OPTIONS.some((p) => p.id === v);
}

/** Map company modules to existing feature-flag keys. */
export function profileToFeatureFlags(profile: CompanyProfile): FeatureFlags {
  return {
    operationsSuite: profile.modules.dispatch,
    manualDispatchMode: !profile.modules.employeePortal,
    truckFocus: profile.modules.dispatch && profile.modules.vehicles,
    deliveryRounds: profile.modules.dispatch,
    smartDispatch: profile.modules.dispatch,
    warehouseWms: profile.modules.warehouse,
  };
}

export const COMPANY_PROFILE_SETTING_KEY = "company_profile";
