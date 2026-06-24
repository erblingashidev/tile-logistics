/** Default m² per pallet when tile size is not in the standards table */
export const M2_PER_PALLET_DEFAULT = 50;

/** Default kg per pallet estimate for unknown tile formats (advisory) */
export const KG_PER_TILE_PALLET_DEFAULT = 1000;

/** @deprecated use getKgPerPalletForTile() or KG_PER_TILE_PALLET_DEFAULT */
export const KG_PER_TILE_PALLET = KG_PER_TILE_PALLET_DEFAULT;

/** Default reference thickness (cm) when not specified */
export const TILE_THICKNESS_STANDARD_CM = 1;

export const MAX_DELIVERY_ROUNDS = 5;
export const DELIVERY_ROUNDS = [1, 2, 3, 4, 5] as const;
export type DeliveryRound = (typeof DELIVERY_ROUNDS)[number];

export const VEHICLE_STATUSES = [
  "available",
  "on_road",
  "returning",
  "maintenance",
  "offline",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const EMPLOYEE_STATUSES = [
  "available",
  "busy",
  "on_break",
  "off_duty",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_ROLES = [
  { id: "picker", label: "Picker (loader)" },
  { id: "driver", label: "Driver" },
  { id: "showroom_picker", label: "Picker for showroom" },
  { id: "cleaner", label: "Cleaner" },
  { id: "maintainer", label: "Maintainer" },
  { id: "unloader", label: "Unloader" },
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number]["id"];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRole, string> =
  Object.fromEntries(EMPLOYEE_ROLES.map((r) => [r.id, r.label])) as Record<
    EmployeeRole,
    string
  >;

export const ORDER_STATUSES = [
  "pending",
  "assigned",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Proof-of-delivery steps employees capture on the portal */
export const DELIVERY_PROOF_PHASES = [
  {
    id: "loaded",
    label: "Loaded at warehouse",
    shortLabel: "Loaded",
    roles: ["picker", "unloader"] as EmployeeRole[],
    nextOrderStatus: "assigned" as OrderStatus,
    photoRequired: false,
    notesRequired: false,
  },
  {
    id: "load_skipped",
    label: "Could not load — explain why",
    shortLabel: "Cannot load",
    roles: ["picker", "unloader"] as EmployeeRole[],
    nextOrderStatus: "assigned" as OrderStatus,
    photoRequired: false,
    notesRequired: true,
  },
  {
    id: "departed",
    label: "Left warehouse / on the way",
    shortLabel: "On the way",
    roles: ["driver"] as EmployeeRole[],
    nextOrderStatus: "in_transit" as OrderStatus,
    photoRequired: false,
    notesRequired: false,
    truckDepart: true,
  },
  {
    id: "arrived",
    label: "Arrived at customer",
    shortLabel: "Arrived",
    roles: ["driver"] as EmployeeRole[],
    nextOrderStatus: "in_transit" as OrderStatus,
    photoRequired: false,
    notesRequired: false,
  },
  {
    id: "delivered",
    label: "Delivered to customer",
    shortLabel: "Delivered",
    roles: ["driver"] as EmployeeRole[],
    nextOrderStatus: "delivered" as OrderStatus,
    photoRequired: true,
    notesRequired: false,
  },
] as const;

export type DeliveryProofPhase = (typeof DELIVERY_PROOF_PHASES)[number]["id"];

export const DELIVERY_PROOF_LABELS: Record<DeliveryProofPhase, string> =
  Object.fromEntries(
    DELIVERY_PROOF_PHASES.map((p) => [p.id, p.label])
  ) as Record<DeliveryProofPhase, string>;

export const PRODUCT_TYPES = ["tile", "adhesive"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** AGIMI standard pallet specs — face dimensions in cm, thickness in cm */
export interface TilePalletStandard {
  id: string;
  widthCm: number;
  heightCm: number;
  thicknessCm: number;
  piecesPerPallet: number;
  m2PerPallet: number;
  kgPerPallet: number;
  label: string;
}

export const TILE_PALLET_STANDARDS: TilePalletStandard[] = [
  {
    id: "60x120x20",
    widthCm: 60,
    heightCm: 120,
    thicknessCm: 2,
    piecesPerPallet: 32,
    m2PerPallet: 23.04,
    kgPerPallet: 888,
    label: "60×120×20 mm",
  },
  {
    id: "120x120",
    widthCm: 120,
    heightCm: 120,
    thicknessCm: 1,
    piecesPerPallet: 40,
    m2PerPallet: 57.6,
    kgPerPallet: 1265,
    label: "120×120",
  },
  {
    id: "120x280",
    widthCm: 120,
    heightCm: 280,
    thicknessCm: 1,
    piecesPerPallet: 20,
    m2PerPallet: 67.2,
    kgPerPallet: 1200,
    label: "120×280",
  },
  {
    id: "60x60",
    widthCm: 60,
    heightCm: 60,
    thicknessCm: 1,
    piecesPerPallet: 150,
    m2PerPallet: 54,
    kgPerPallet: 972,
    label: "60×60",
  },
  {
    id: "60x120x9",
    widthCm: 60,
    heightCm: 120,
    thicknessCm: 0.9,
    piecesPerPallet: 72,
    m2PerPallet: 51.84,
    kgPerPallet: 1062,
    label: "60×120×9 mm",
  },
  {
    id: "160x160",
    widthCm: 160,
    heightCm: 160,
    thicknessCm: 1,
    piecesPerPallet: 20,
    m2PerPallet: 51.2,
    kgPerPallet: 1000,
    label: "160×160",
  },
];

export const TILE_FORMAT_PRESETS = [
  ...TILE_PALLET_STANDARDS.map((s) => ({
    id: s.id,
    label: s.label,
    widthCm: s.widthCm,
    heightCm: s.heightCm,
  })),
  { id: "custom", label: "Custom size", widthCm: 60, heightCm: 60 },
] as const;

export interface TileSpecOptions {
  presetId?: string | null;
  /** Only set when the user manually overrides thickness */
  manualThicknessCm?: number | null;
}

/** Build lookup key from tile face dimensions (smaller × larger) */
export function tileSizeKey(widthCm: number, heightCm: number): string {
  const a = Math.min(widthCm, heightCm);
  const b = Math.max(widthCm, heightCm);
  return `${a}x${b}`;
}

export function tileFaceAreaM2(widthCm: number, heightCm: number): number {
  return (widthCm / 100) * (heightCm / 100);
}

function thicknessMatches(a: number, b: number, tolerance = 0.05): boolean {
  return Math.abs(a - b) <= tolerance;
}

export interface ResolvedTilePalletSpec {
  standardId: string | null;
  label: string;
  piecesPerPallet: number;
  m2PerPallet: number;
  kgPerPallet: number;
  referenceThicknessCm: number;
  adjustedForThickness: boolean;
}

function findStandardByFace(
  widthCm: number,
  heightCm: number
): TilePalletStandard | undefined {
  const key = tileSizeKey(widthCm, heightCm);
  const matches = TILE_PALLET_STANDARDS.filter(
    (s) => tileSizeKey(s.widthCm, s.heightCm) === key
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function resolveStandard(
  widthCm: number,
  heightCm: number,
  options: TileSpecOptions = {}
): TilePalletStandard | undefined {
  const { presetId } = options;
  if (presetId && presetId !== "custom") {
    const byPreset = TILE_PALLET_STANDARDS.find((s) => s.id === presetId);
    if (byPreset) return byPreset;
  }
  return findStandardByFace(widthCm, heightCm);
}

/** Resolve pallet spec from tile format preset; thickness override only when manually provided */
export function getTilePalletSpec(
  widthCm: number,
  heightCm: number,
  options: TileSpecOptions = {}
): ResolvedTilePalletSpec {
  const { manualThicknessCm } = options;
  const standard = resolveStandard(widthCm, heightCm, options);
  const faceArea = tileFaceAreaM2(widthCm, heightCm);

  if (standard) {
    if (manualThicknessCm == null) {
      return {
        standardId: standard.id,
        label: standard.label,
        piecesPerPallet: standard.piecesPerPallet,
        m2PerPallet: standard.m2PerPallet,
        kgPerPallet: standard.kgPerPallet,
        referenceThicknessCm: standard.thicknessCm,
        adjustedForThickness: false,
      };
    }

    if (thicknessMatches(standard.thicknessCm, manualThicknessCm)) {
      return {
        standardId: standard.id,
        label: standard.label,
        piecesPerPallet: standard.piecesPerPallet,
        m2PerPallet: standard.m2PerPallet,
        kgPerPallet: standard.kgPerPallet,
        referenceThicknessCm: standard.thicknessCm,
        adjustedForThickness: false,
      };
    }

    const ratio = standard.thicknessCm / manualThicknessCm;
    const piecesPerPallet = Math.max(
      1,
      Math.round(standard.piecesPerPallet * ratio)
    );
    const m2PerPallet = Math.round(piecesPerPallet * faceArea * 100) / 100;
    const kgPerPallet = Math.round(
      standard.kgPerPallet * (piecesPerPallet / standard.piecesPerPallet)
    );

    return {
      standardId: standard.id,
      label: standard.label,
      piecesPerPallet,
      m2PerPallet,
      kgPerPallet,
      referenceThicknessCm: standard.thicknessCm,
      adjustedForThickness: true,
    };
  }

  const m2PerPallet = M2_PER_PALLET_DEFAULT;
  const piecesPerPallet =
    faceArea > 0 ? Math.floor(m2PerPallet / faceArea) : 0;

  return {
    standardId: null,
    label: `${widthCm}×${heightCm} cm`,
    piecesPerPallet,
    m2PerPallet,
    kgPerPallet: KG_PER_TILE_PALLET_DEFAULT,
    referenceThicknessCm: manualThicknessCm ?? 1,
    adjustedForThickness: false,
  };
}

export function inferPresetIdFromDimensions(
  widthCm: number,
  heightCm: number,
  manualThicknessCm?: number | null
): string | null {
  const key = tileSizeKey(widthCm, heightCm);
  const matches = TILE_PALLET_STANDARDS.filter(
    (s) => tileSizeKey(s.widthCm, s.heightCm) === key
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0].id;
  if (manualThicknessCm != null) {
    const best = [...matches].sort(
      (a, b) =>
        Math.abs(a.thicknessCm - manualThicknessCm) -
        Math.abs(b.thicknessCm - manualThicknessCm)
    )[0];
    return best.id;
  }
  return null;
}

export function getM2PerPalletForTile(
  widthCm: number,
  heightCm: number,
  options: TileSpecOptions = {}
): number {
  return getTilePalletSpec(widthCm, heightCm, options).m2PerPallet;
}

export function getPiecesPerPallet(
  widthCm: number,
  heightCm: number,
  options: TileSpecOptions = {}
): number {
  return getTilePalletSpec(widthCm, heightCm, options).piecesPerPallet;
}

export function getKgPerPalletForTile(
  widthCm: number,
  heightCm: number,
  options: TileSpecOptions = {}
): number {
  return getTilePalletSpec(widthCm, heightCm, options).kgPerPallet;
}
