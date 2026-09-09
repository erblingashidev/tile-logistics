import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  CATEGORY_PRESETS,
  COMPANY_CATEGORIES,
  PRODUCT_FOCUS_OPTIONS,
  type CompanyCategory,
  type ProductFocus,
} from "@/lib/company-profile";
import { inferWarehouseCoordinates } from "@/lib/organizations/warehouse";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";
import {
  completeOnboarding,
  getOrganizationDisplayName,
  getOrganizationProfile,
  listOrganizationUnits,
  OrganizationError,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin();
    const organizationId = session.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "No organization linked." }, { status: 400 });
    }

    const [profile, units, organizationName] = await Promise.all([
      getOrganizationProfile(organizationId),
      listOrganizationUnits(organizationId),
      getOrganizationDisplayName(organizationId),
    ]);

    return NextResponse.json({
      organizationId,
      organizationName,
      profile,
      units,
      categories: COMPANY_CATEGORIES,
      productFocusOptions: PRODUCT_FOCUS_OPTIONS,
      presets: CATEGORY_PRESETS,
      isLegacyAgimi: isLegacyAgimiOrganization(organizationId),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const organizationId = session.organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: "No organization linked." }, { status: 400 });
    }
    if (isLegacyAgimiOrganization(organizationId)) {
      return NextResponse.json(
        { error: "AGIMI is already configured." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      companyName?: string;
      companyCategory?: CompanyCategory;
      productFocus?: ProductFocus;
      warehouse?: {
        name?: string;
        address?: string;
        city?: string;
        lat?: number;
        lng?: number;
      };
      modules?: {
        vehicles?: boolean;
        dispatch?: boolean;
        warehouse?: boolean;
        returns?: boolean;
        employeePortal?: boolean;
        useInvoices?: boolean;
      };
      units?: Array<{ code: string; label: string; sortOrder?: number }>;
    };

    const companyName = body.companyName?.trim();
    if (!companyName) {
      return NextResponse.json(
        { error: "Company name is required." },
        { status: 400 }
      );
    }

    const warehouseName = body.warehouse?.name?.trim();
    const warehouseAddress = body.warehouse?.address?.trim();
    const warehouseCity = body.warehouse?.city?.trim();
    if (!warehouseName || !warehouseAddress) {
      return NextResponse.json(
        { error: "Warehouse name and address are required." },
        { status: 400 }
      );
    }

    const coords =
      Number.isFinite(body.warehouse?.lat) && Number.isFinite(body.warehouse?.lng)
        ? {
            lat: Number(body.warehouse!.lat),
            lng: Number(body.warehouse!.lng),
            city: warehouseCity,
          }
        : inferWarehouseCoordinates({
            city: warehouseCity,
            address: warehouseAddress,
          });

    const category = body.companyCategory ?? "general";
    const preset = CATEGORY_PRESETS[category] ?? CATEGORY_PRESETS.general;
    const units =
      body.units?.filter((u) => u.code?.trim() && u.label?.trim()) ??
      preset.suggestedUnits ??
      [];

    if (!units.length) {
      return NextResponse.json(
        { error: "Add at least one quantity unit (e.g. pieces, m², bags)." },
        { status: 400 }
      );
    }

    const profile = await completeOnboarding({
      organizationId,
      companyName,
      companyCategory: category,
      productFocus: body.productFocus ?? preset.productFocus ?? "general",
      modules: {
        vehicles: body.modules?.vehicles === true,
        dispatch: body.modules?.dispatch === true,
        warehouse: body.modules?.warehouse === true,
        returns: body.modules?.returns !== false,
        employeePortal: body.modules?.employeePortal === true,
        useInvoices: body.modules?.useInvoices !== false,
      },
      units,
      warehouse: {
        name: warehouseName,
        address: warehouseAddress,
        city: coords.city ?? warehouseCity,
        lat: coords.lat,
        lng: coords.lng,
      },
    });

    return NextResponse.json({ ok: true, profile, units });
  } catch (err) {
    if (err instanceof OrganizationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[onboarding POST]", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
