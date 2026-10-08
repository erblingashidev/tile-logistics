import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { requireApiCompanyAdmin } from "@/lib/auth/api-guard";
import {
  parseCompanyWarehouseInput,
  type CompanyCategory,
  type ProductFocus,
} from "@/lib/company-profile";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";
import {
  getOrganizationDisplayName,
  getOrganizationProfile,
  getOrganizationWarehouse,
  listOrganizationUnits,
  updateOrganizationCompanySettings,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin();
    const organizationId = session.organizationId ?? DEFAULT_ORGANIZATION_ID;
    if (!organizationId) {
      return NextResponse.json({ profile: null, units: [], organizationName: null });
    }
    const [profile, units, organizationName, warehouse] = await Promise.all([
      getOrganizationProfile(organizationId),
      listOrganizationUnits(organizationId),
      getOrganizationDisplayName(organizationId),
      getOrganizationWarehouse(organizationId),
    ]);
    return NextResponse.json({
      profile,
      units,
      warehouse,
      organizationName,
      organizationId,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiCompanyAdmin();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      companyName?: string;
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
      warehouse?: unknown;
      units?: Array<{ code: string; label: string; sortOrder?: number }>;
    };

    const modules = body.modules;
    const wantsWarehouse = modules?.warehouse === true;
    const parsedWarehouse = parseCompanyWarehouseInput(body.warehouse);
    if (wantsWarehouse && !parsedWarehouse) {
      return NextResponse.json(
        { error: "Warehouse name, address, and map coordinates are required when WMS is on." },
        { status: 400 }
      );
    }

    const profile = await updateOrganizationCompanySettings({
      organizationId: auth.organizationId,
      companyName: body.companyName,
      companyCategory: body.companyCategory,
      productFocus: body.productFocus,
      modules: modules
        ? {
            vehicles: modules.vehicles === true,
            dispatch: modules.dispatch === true,
            warehouse: modules.warehouse === true,
            returns: modules.returns !== false,
            employeePortal: modules.employeePortal === true,
            useInvoices: modules.useInvoices !== false,
          }
        : undefined,
      warehouse: parsedWarehouse ?? undefined,
      units: body.units,
    });

    const [organizationName, warehouse] = await Promise.all([
      getOrganizationDisplayName(auth.organizationId),
      getOrganizationWarehouse(auth.organizationId),
    ]);

    return NextResponse.json({
      ok: true,
      profile,
      organizationName,
      warehouse,
    });
  } catch {
    return NextResponse.json({ error: "Could not save company settings." }, { status: 400 });
  }
}
