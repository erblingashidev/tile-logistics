import { assignOrderBundle } from "@/lib/services/orders";
import type { DispatchRecommendation } from "@/lib/dispatch/recommendations";
import { validateTruckForOrder } from "@/lib/dispatch/validate-assignment";

export async function applyDispatchRecommendation(
  recommendation: DispatchRecommendation,
  options?: {
    ignoreWeightWarning?: boolean;
    ignoreCraneRule?: boolean;
  }
) {
  const results: Array<{
    orderId: number;
    ok: boolean;
    error?: string;
    warning?: string;
  }> = [];

  for (const orderId of recommendation.orderIds) {
    const truckCheck = await validateTruckForOrder(
      orderId,
      recommendation.vehicleId,
      { ignoreCraneRule: options?.ignoreCraneRule }
    );
    if (!truckCheck.ok) {
      results.push({ orderId, ok: false, error: truckCheck.error });
      continue;
    }

    const result = await assignOrderBundle({
      orderId,
      vehicleId: recommendation.vehicleId,
      deliveryRound: recommendation.deliveryRound,
      pickerId: recommendation.pickerId,
      autoAssignTeam: true,
      ignoreWeightWarning: options?.ignoreWeightWarning ?? false,
      ignoreCraneRule: options?.ignoreCraneRule ?? false,
    });

    if (!result.ok) {
      results.push({
        orderId,
        ok: false,
        error: "error" in result ? result.error : "Assignment failed",
      });
      if (!("isWeightWarning" in result && result.isWeightWarning)) {
        break;
      }
      continue;
    }

    results.push({
      orderId,
      ok: true,
      warning: truckCheck.ok ? truckCheck.warning : undefined,
    });
  }

  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    results,
    recommendationId: recommendation.id,
  };
}

export async function applyDispatchPlan(
  recommendations: DispatchRecommendation[],
  options?: {
    ignoreWeightWarning?: boolean;
    ignoreCraneRule?: boolean;
    recommendationIds?: string[];
  }
) {
  let toApply = recommendations;
  if (options?.recommendationIds?.length) {
    const ids = new Set(options.recommendationIds);
    toApply = recommendations.filter((r) => ids.has(r.id));
  }

  const allResults: Awaited<ReturnType<typeof applyDispatchRecommendation>>[] = [];
  for (const rec of toApply) {
    allResults.push(await applyDispatchRecommendation(rec, options));
  }

  const failed = allResults.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    applied: allResults.filter((r) => r.ok).length,
    results: allResults,
  };
}
