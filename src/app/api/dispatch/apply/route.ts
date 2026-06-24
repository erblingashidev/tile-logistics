import { NextRequest, NextResponse } from "next/server";
import { applyDispatchPlan } from "@/lib/dispatch/apply";
import type { DispatchRecommendation } from "@/lib/dispatch/recommendations";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const recommendations = (body.recommendations ??
    []) as DispatchRecommendation[];
  const recommendationIds = body.recommendationIds as string[] | undefined;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return NextResponse.json(
      { error: "recommendations array is required" },
      { status: 400 }
    );
  }

  const result = await applyDispatchPlan(recommendations, {
    recommendationIds,
    ignoreWeightWarning,
    ignoreCraneRule,
  });

  if (!result.ok) {
    const hasWeight = result.results.some((r) =>
      r.results.some(
        (x) => !x.ok && x.error?.toLowerCase().includes("weight")
      )
    );
    return NextResponse.json(result, { status: hasWeight ? 422 : 409 });
  }

  return NextResponse.json(result);
}
