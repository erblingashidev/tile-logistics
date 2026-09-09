import { NextResponse } from "next/server";
import { COMPANY_CATEGORIES } from "@/lib/company-profile";
import {
  OrganizationError,
  submitOrganizationApplication,
} from "@/lib/services/organizations";
import {
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  if (!checkRateLimit(`signup:${ip}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again later." },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      orgName?: string;
      slug?: string;
      contactName?: string;
      contactEmail?: string;
      adminUsername?: string;
      adminPassword?: string;
      companyCategory?: string;
      message?: string;
    };

    const category = COMPANY_CATEGORIES.find((c) => c.id === body.companyCategory)
      ?.id;

    const result = await submitOrganizationApplication({
      orgName: body.orgName ?? "",
      slug: body.slug,
      contactName: body.contactName ?? "",
      contactEmail: body.contactEmail ?? "",
      adminUsername: body.adminUsername ?? "",
      adminPassword: body.adminPassword ?? "",
      companyCategory: category ?? "general",
      message: body.message,
    });

    return NextResponse.json({
      ok: true,
      applicationId: result.applicationId,
      message:
        "Application submitted. You will be able to log in after the platform owner approves your company.",
    });
  } catch (err) {
    if (err instanceof OrganizationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[auth/signup]", err);
    return NextResponse.json({ error: "Could not submit application." }, { status: 500 });
  }
}
