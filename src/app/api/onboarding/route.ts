import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  CATEGORY_PRESETS,
  COMPANY_CATEGORIES,
  PRODUCT_FOCUS_OPTIONS,
  type CompanyCategory,
  type ProductFocus,
} from "@/lib/company-profile";
import {
  completeOnboarding,
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

    const [profile, units] = await Promise.all([
      getOrganizationProfile(organizationId),
      listOrganizationUnits(organizationId),
    ]);

    return NextResponse.json({
      organizationId,
      profile,
      units,
      categories: COMPANY_CATEGORIES,
      productFocusOptions: PRODUCT_FOCUS_OPTIONS,
      presets: CATEGORY_PRESETS,
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

    const body = (await request.json()) as {
      companyCategory?: CompanyCategory;
      productFocus?: ProductFocus;
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
